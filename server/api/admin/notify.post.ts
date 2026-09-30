import { notifyChapters } from '../../utils/notify-chapters'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user?.role !== 'admin') throw createError({ statusCode: 403, message: 'Нет доступа' })

  const body = await readBody(event) as { chapterIds?: unknown, text?: unknown } | null
  const chapterIds = Array.isArray(body?.chapterIds) ? body.chapterIds.map(String) : undefined

  // Текст можно поправить в панели перед отправкой. Потолок — телеграмовский:
  // длиннее он просто не примет.
  const text = typeof body?.text === 'string' ? body.text.replace(/\r\n?/g, '\n').trim() : undefined
  if (text && text.length > 4096) {
    throw createError({ statusCode: 400, message: 'Слишком длинно: телеграм берёт до 4096 знаков' })
  }

  // Ручная отправка намеренно идёт мимо суточного лимита крона и не двигает его отметку:
  // админ решает сам, когда и сколько раз слать, а расписание крона от этого не съезжает.
  const result = await notifyChapters({ chapterIds, text })

  if (result.reason === 'telegram-not-configured') {
    throw createError({ statusCode: 503, message: 'Телеграм-бот не настроен: нет TELEGRAM_BOT_TOKEN или TELEGRAM_CHANNEL_ID' })
  }
  if (result.reason === 'nothing-to-send') {
    throw createError({ statusCode: 400, message: 'Нечего отправлять: про выбранные главы уже писали либо ничего не выбрано' })
  }

  return { ok: true, count: result.count, message: result.message, chapterIds: result.chapterIds }
})
