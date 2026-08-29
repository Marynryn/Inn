import { notifyChapters } from '../../utils/notify-chapters'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user?.role !== 'admin') throw createError({ statusCode: 403, message: 'Нет доступа' })

  const body = await readBody(event) as { chapterIds?: unknown } | null
  const chapterIds = Array.isArray(body?.chapterIds) ? body.chapterIds.map(String) : undefined

  // Ручная отправка намеренно идёт мимо суточного лимита крона и не двигает его отметку:
  // админ решает сам, когда и сколько раз слать, а расписание крона от этого не съезжает.
  const result = await notifyChapters({ chapterIds })

  if (result.reason === 'telegram-not-configured') {
    throw createError({ statusCode: 503, message: 'Телеграм-бот не настроен: нет TELEGRAM_BOT_TOKEN или TELEGRAM_CHANNEL_ID' })
  }
  if (result.reason === 'nothing-to-send') {
    throw createError({ statusCode: 400, message: 'Нечего отправлять: про выбранные главы уже писали либо ничего не выбрано' })
  }

  return { ok: true, count: result.count, message: result.message, chapterIds: result.chapterIds }
})
