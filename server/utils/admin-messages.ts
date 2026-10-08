import { and, desc, eq, ne } from 'drizzle-orm'
import { adminMessages, users } from '../database/schema'
import { useDb } from './db'
import { framesByIds } from './frames'
import { readerName } from './identity'
import { wsUsers } from './ws-rooms'

/** Длиннее письма в личку не бывает; ограничение — от случайно вставленной простыни. */
export const MESSAGE_MAX = 2000

/** Сколько последних сообщений отдаём в разговоре. Админов единицы, переписка
 *  короткая — подгрузка старого появится, когда до неё дойдёт. */
export const THREAD_LIMIT = 300

/** Собеседник — только другой админ. Читатель, удалённый или сам себе — нет. */
export async function adminPeer(id: number, me: number) {
  if (!Number.isInteger(id) || id === me) return null
  const [row] = await useDb()
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      avatarFrameId: users.avatarFrameId,
    })
    .from(users)
    .where(and(eq(users.id, id), eq(users.role, 'admin')))
  return row ?? null
}

/** Остальные админы — в том виде, в каком их рисует список собеседников. */
export async function otherAdmins(me: number) {
  const rows = await useDb()
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      avatarFrameId: users.avatarFrameId,
    })
    .from(users)
    .where(and(eq(users.role, 'admin'), ne(users.id, me)))
  const frames = await framesByIds(rows.map(r => r.avatarFrameId))
  return rows.map(r => ({
    id: r.id,
    name: readerName(r),
    avatarUrl: r.avatarUrl,
    avatarFrame: r.avatarFrameId ? frames.get(r.avatarFrameId) ?? null : null,
    // На сайте сейчас — держит открытый сокет уведомлений хоть в одной вкладке.
    online: wsUsers.has(r.id),
  }))
}

/**
 * Непрочитанное мне — по человеку: от кого, сколько и последнее сообщение.
 * Колокольчику нужна строка на собеседника, а не на каждое сообщение: пять
 * сообщений подряд — это один «написал», а не пять строк.
 */
export async function unreadBySender(me: number) {
  const rows = await useDb()
    .select({
      id: adminMessages.id,
      fromUserId: adminMessages.fromUserId,
      body: adminMessages.body,
      createdAt: adminMessages.createdAt,
    })
    .from(adminMessages)
    .where(and(eq(adminMessages.toUserId, me), eq(adminMessages.isRead, false)))
    .orderBy(desc(adminMessages.id))

  const bySender = new Map<number, { fromUserId: number, count: number, body: string, createdAt: string }>()
  for (const r of rows) {
    const seen = bySender.get(r.fromUserId)
    // Строки идут от новых к старым: первая встреченная — последнее сообщение.
    if (seen) seen.count++
    else bySender.set(r.fromUserId, { fromUserId: r.fromUserId, count: 1, body: r.body, createdAt: r.createdAt })
  }
  return [...bySender.values()]
}
