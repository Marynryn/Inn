import { sendTelegramMessage } from '../../../utils/telegram'

/** Потолок телеграма на одно сообщение. */
const TELEGRAM_TEXT_MAX = 4096

/**
 * Своё сообщение в канал — текстом, написанным в панели: анонс ивента,
 * новость, что угодно. Уходит как есть, простым текстом: разметку телеграм
 * разбирает строго, и одна лишняя звёздочка отклонила бы всё сообщение.
 * Ссылки телеграм делает кликабельными сам.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ text?: string }>(event)
  const text = String(body?.text ?? '').replace(/\r\n?/g, '\n').trim()

  if (!text) throw createError({ statusCode: 400, message: 'Сообщение пустое' })
  if (text.length > TELEGRAM_TEXT_MAX) {
    throw createError({ statusCode: 400, message: `Слишком длинно: телеграм берёт до ${TELEGRAM_TEXT_MAX} знаков` })
  }

  let sent: boolean
  try {
    sent = await sendTelegramMessage(text)
  } catch (e: any) {
    // Телеграм отвечает своим описанием ошибки — оно точнее нашего пересказа.
    const reason = e?.data?.description || e?.message || 'нет ответа'
    throw createError({ statusCode: 502, message: `Телеграм не принял сообщение: ${reason}` })
  }

  if (!sent) {
    throw createError({ statusCode: 503, message: 'Телеграм-бот не настроен: нет TELEGRAM_BOT_TOKEN или TELEGRAM_CHANNEL_ID' })
  }

  return { ok: true }
})
