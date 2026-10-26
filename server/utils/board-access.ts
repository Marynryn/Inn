import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { isGenericName, normalizeDisplayName } from '#shared/utils/displayName'
import { users } from '../database/schema'
import { useDb } from './db'
import { isNameFreeForGuest } from './display-name'
import { readerName } from './identity'
import { visitorPrint } from './visitor'
import type { BoardUser } from './board-rooms'

/**
 * Кто может играть на карте: любой вошедший читатель — и гость, назвавшийся
 * перед тем, как сесть за стол. Бан смотрим в базе, а не в сессии: сессия
 * живёт долго.
 */
export async function boardUser(userId: number | null | undefined): Promise<BoardUser | null> {
  if (!userId) return null
  const [row] = await useDb().select().from(users).where(eq(users.id, userId))
  if (!row || row.isBanned) return null
  return { id: row.id, name: readerName(row), avatarUrl: row.avatarUrl, admin: row.role === 'admin' }
}

export async function sessionBoardUser(event: H3Event): Promise<BoardUser | null> {
  const session = await getUserSession(event)
  return boardUser((session.user as { id?: number } | undefined)?.id)
}

export async function requireBoardUser(event: H3Event): Promise<BoardUser> {
  const user = await sessionBoardUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Чтобы создать стол, нужно войти' })
  return user
}

/**
 * Гость за столом — под отрицательным номером, чтобы не спутать с читателем.
 * Номер держится за отпечатком кода браузера, пока жив сервер: перезагрузил
 * страницу — вернулся на своё место. Столы живут в памяти сервера, и номера
 * гостей им под стать.
 */
const guestIds = new Map<string, number>()
let lastGuestId = 0

function guestIdOf(visitor: string): number {
  const print = visitorPrint(visitor, 'board')
  let id = guestIds.get(print)
  if (!id) {
    id = --lastGuestId
    guestIds.set(print, id)
  }
  return id
}

/** Имя гостя: как у гостевых комментариев — чужое, занятое читателем или
 *  служебное нельзя. Безликое «Гость» тоже: за столом нужно отличать игроков. */
export async function guestBoardUser(visitor: string, rawName: unknown): Promise<BoardUser> {
  const name = normalizeDisplayName(rawName)
  if (!name) throw createError({ statusCode: 400, message: 'Назовись, чтобы сесть за стол' })
  if (isGenericName(name) || !await isNameFreeForGuest(name)) {
    throw createError({ statusCode: 409, message: 'Это имя занято, выбери другое' })
  }
  return { id: guestIdOf(visitor), name, avatarUrl: null, admin: false }
}

/**
 * Одноразовые билеты к сокету стола — и для читателей, и для гостей. Кто
 * садится за стол, решает обычный запрос (там есть кука и имя гостя), а
 * сокет только предъявляет билет. Билет живёт минуту.
 */
const tickets = new Map<string, { user: BoardUser; expiresAt: number }>()
const TTL_MS = 60_000

export function issueBoardTicket(user: BoardUser): string {
  const now = Date.now()
  for (const [key, t] of tickets) if (t.expiresAt <= now) tickets.delete(key)
  const ticket = randomUUID()
  tickets.set(ticket, { user, expiresAt: now + TTL_MS })
  return ticket
}

export function claimBoardTicket(ticket: unknown): BoardUser | null {
  if (typeof ticket !== 'string') return null
  const found = tickets.get(ticket)
  tickets.delete(ticket)
  return found && found.expiresAt > Date.now() ? found.user : null
}
