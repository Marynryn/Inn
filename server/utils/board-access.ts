import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { users } from '../database/schema'
import { useDb } from './db'
import { readerName } from './identity'
import type { BoardUser } from './board-rooms'

/**
 * Кто может играть на карте: любой вошедший читатель — имя и аватарка нужны
 * фишке и чату. Ссылки на игру в меню у читателей нет, на стол зовут ссылкой.
 * Бан смотрим в базе, а не в сессии: сессия живёт долго.
 */
export async function boardUser(userId: number | null | undefined): Promise<BoardUser | null> {
  if (!userId) return null
  const [row] = await useDb().select().from(users).where(eq(users.id, userId))
  if (!row || row.isBanned) return null
  return { id: row.id, name: readerName(row), avatarUrl: row.avatarUrl }
}

export async function requireBoardUser(event: H3Event): Promise<BoardUser> {
  const session = await getUserSession(event)
  const user = await boardUser((session.user as { id?: number } | undefined)?.id)
  if (!user) throw createError({ statusCode: 401, message: 'Чтобы играть, нужно войти' })
  return user
}
