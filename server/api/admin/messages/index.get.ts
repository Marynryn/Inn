import { and, desc, eq, or } from 'drizzle-orm'
import { adminMessages } from '../../../database/schema'
import { useDb } from '../../../utils/db'
import { otherAdmins, unreadBySender } from '../../../utils/admin-messages'

/**
 * Собеседники для вкладки «Сообщения»: все остальные админы, у каждого —
 * последнее сообщение разговора и есть ли от него непрочитанное. Сверху те, с
 * кем говорили недавно; с кем ни разу — внизу, по имени.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const me = (session.user as { id?: number } | undefined)?.id
  if (!me) throw createError({ statusCode: 401, message: 'Нужен вход' })

  const db = useDb()
  const admins = await otherAdmins(me)
  const unread = new Set((await unreadBySender(me)).map(u => u.fromUserId))

  const people = await Promise.all(admins.map(async (a) => {
    const [last] = await db
      .select({ id: adminMessages.id, fromUserId: adminMessages.fromUserId, body: adminMessages.body, createdAt: adminMessages.createdAt })
      .from(adminMessages)
      .where(or(
        and(eq(adminMessages.fromUserId, me), eq(adminMessages.toUserId, a.id)),
        and(eq(adminMessages.fromUserId, a.id), eq(adminMessages.toUserId, me)),
      ))
      .orderBy(desc(adminMessages.id))
      .limit(1)
    return {
      ...a,
      unread: unread.has(a.id),
      last: last ? { id: last.id, mine: last.fromUserId === me, body: last.body, createdAt: last.createdAt } : null,
    }
  }))

  return people.sort((x, y) =>
    (y.last?.id ?? 0) - (x.last?.id ?? 0) || x.name.localeCompare(y.name, 'ru'))
})
