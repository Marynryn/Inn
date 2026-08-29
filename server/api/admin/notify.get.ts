import { getLastNotifyAt, getPendingChapters } from '../../utils/notify-chapters'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user?.role !== 'admin') throw createError({ statusCode: 403, message: 'Нет доступа' })

  const config = useRuntimeConfig()

  // Только то, про что ещё не писали: разосланные главы в админке не нужны,
  // а их список со временем вырос бы до сотен строк.
  return {
    configured: Boolean(config.telegram.botToken && config.telegram.chatId),
    lastNotifyAt: await getLastNotifyAt(),
    chapters: await getPendingChapters(),
  }
})
