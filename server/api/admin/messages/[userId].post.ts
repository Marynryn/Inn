import { adminMessages } from '../../../database/schema'
import { useDb } from '../../../utils/db'
import { MESSAGE_MAX, adminPeer } from '../../../utils/admin-messages'
import { wsToUser } from '../../../utils/ws-rooms'

/**
 * Отправить сообщение другому админу. Получателю — два толчка в сокет: один
 * для открытого разговора (сообщение появляется сразу), другой для колокольчика.
 * Себе — тоже: у отправителя может быть открыт тот же разговор в другой вкладке.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const me = (session.user as { id?: number } | undefined)?.id
  if (!me) throw createError({ statusCode: 401, message: 'Нужен вход' })

  const peer = await adminPeer(Number(getRouterParam(event, 'userId')), me)
  if (!peer) throw createError({ statusCode: 404, message: 'Такого админа нет' })

  const raw = (await readBody<{ body?: unknown }>(event))?.body
  const body = typeof raw === 'string' ? raw.trim() : ''
  if (!body) throw createError({ statusCode: 400, message: 'Пустое сообщение' })
  if (body.length > MESSAGE_MAX) {
    throw createError({ statusCode: 400, message: `Слишком длинно: не больше ${MESSAGE_MAX} знаков` })
  }

  const [row] = await useDb()
    .insert(adminMessages)
    .values({ fromUserId: me, toUserId: peer.id, body })
    .returning()

  const item = { id: row!.id, body: row!.body, createdAt: row!.createdAt }
  wsToUser(peer.id, { type: 'message', from: me, to: peer.id, ...item })
  wsToUser(peer.id, { type: 'notification' })
  wsToUser(me, { type: 'message', from: me, to: peer.id, ...item })

  return { ...item, mine: true }
})
