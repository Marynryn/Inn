import { and, desc, eq, or } from 'drizzle-orm'
import { adminMessages } from '../../../database/schema'
import { useDb } from '../../../utils/db'
import { THREAD_LIMIT, adminPeer } from '../../../utils/admin-messages'
import { framesByIds } from '../../../utils/frames'
import { readerName } from '../../../utils/identity'
import { wsToUser } from '../../../utils/ws-rooms'

/**
 * Разговор с одним админом. Открыл — значит прочитал: входящие помечаются
 * прочитанными здесь же, а не отдельным запросом, — иначе колокольчик в
 * соседней вкладке ещё какое-то время звал бы к уже прочитанному.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const me = (session.user as { id?: number } | undefined)?.id
  if (!me) throw createError({ statusCode: 401, message: 'Нужен вход' })

  const peer = await adminPeer(Number(getRouterParam(event, 'userId')), me)
  if (!peer) throw createError({ statusCode: 404, message: 'Такого админа нет' })

  const db = useDb()
  const rows = await db
    .select()
    .from(adminMessages)
    .where(or(
      and(eq(adminMessages.fromUserId, me), eq(adminMessages.toUserId, peer.id)),
      and(eq(adminMessages.fromUserId, peer.id), eq(adminMessages.toUserId, me)),
    ))
    .orderBy(desc(adminMessages.id))
    .limit(THREAD_LIMIT)

  if (rows.some(r => r.toUserId === me && !r.isRead)) {
    await db
      .update(adminMessages)
      .set({ isRead: true })
      .where(and(eq(adminMessages.fromUserId, peer.id), eq(adminMessages.toUserId, me), eq(adminMessages.isRead, false)))
    // Колокольчик в других вкладках перечитает список и уберёт строку.
    wsToUser(me, { type: 'notification' })
  }

  const frames = await framesByIds([peer.avatarFrameId])
  return {
    with: {
      id: peer.id,
      name: readerName(peer),
      avatarUrl: peer.avatarUrl,
      avatarFrame: peer.avatarFrameId ? frames.get(peer.avatarFrameId) ?? null : null,
    },
    // Сверху старые: разговор читают сверху вниз.
    items: rows.reverse().map(r => ({
      id: r.id,
      mine: r.fromUserId === me,
      body: r.body,
      createdAt: r.createdAt,
    })),
  }
})
