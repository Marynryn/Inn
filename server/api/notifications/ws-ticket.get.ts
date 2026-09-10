import { issueTicket } from '../../utils/notify-tickets'

/**
 * Билет на подписку по WebSocket. Здесь есть кука, поэтому сервер точно знает,
 * кто просит; сам сокет этого не знает и потому спрашивает билет.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = (session.user as { id?: number } | undefined)?.id ?? null

  if (!userId) throw createError({ statusCode: 401, message: 'Нужен вход' })

  return { ticket: issueTicket(userId) }
})
