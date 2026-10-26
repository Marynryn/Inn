import { readVisitor } from '../../utils/visitor'
import { guestBoardUser, issueBoardTicket, sessionBoardUser } from '../../utils/board-access'

/**
 * Билет к сокету стола. Вошедший садится под своим именем; гость — под тем,
 * что ввёл, и с кодом браузера, по которому вернётся на своё место.
 */
export default defineEventHandler(async (event) => {
  const user = await sessionBoardUser(event)
  if (user) return { ticket: issueBoardTicket(user), name: user.name, guest: false }

  const visitor = await readVisitor(event)
  if (!visitor) throw createError({ statusCode: 400, message: 'Браузер не дал сохранить, кто ты, — без этого за стол не сесть' })
  const body = await readBody<{ name?: unknown }>(event).catch(() => ({} as { name?: unknown }))
  const guest = await guestBoardUser(visitor, body?.name)
  return { ticket: issueBoardTicket(guest), name: guest.name, guest: true }
})
