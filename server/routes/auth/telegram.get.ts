import { rememberNext } from '../../utils/identity'
import { telegramBotId } from '../../utils/telegram'

/**
 * Отправляет человека на страницу входа телеграма. Сюда же ведёт кнопка со
 * страницы входа.
 *
 * Адрес возврата отдаём голым, без своих параметров: телеграм дописывает к нему
 * собственные поля, и второй вопросительный знак ломает строку запроса — подпись
 * до нас просто не доезжает. Куда вернуть человека, запоминаем в куке, как и у
 * Google.
 */
export default defineEventHandler((event) => {
  const botId = telegramBotId()
  if (!botId) throw createError({ statusCode: 503, message: 'Телеграм-бот не настроен' })

  rememberNext(event)
  const origin = getRequestURL(event).origin

  return sendRedirect(event, 'https://oauth.telegram.org/auth'
    + `?bot_id=${botId}`
    + `&origin=${encodeURIComponent(origin)}`
    + `&return_to=${encodeURIComponent(`${origin}/auth/telegram/done`)}`)
})
