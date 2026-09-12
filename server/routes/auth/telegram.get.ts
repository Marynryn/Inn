import { sendBrowserRedirect } from '../../utils/browser-redirect'
import { rememberNext } from '../../utils/identity'
import { publicOrigin, viaMirror } from '../../utils/public-origin'
import { telegramBotId } from '../../utils/telegram'

/**
 * Отправляет человека на страницу входа телеграма. Сюда же ведёт кнопка со
 * страницы входа.
 *
 * Адрес возврата отдаём голым, без своих параметров: телеграм дописывает к нему
 * собственные поля, и второй вопросительный знак ломает строку запроса — подпись
 * до нас просто не доезжает. Куда вернуть человека, запоминаем в куке, как и у
 * Google.
 *
 * С зеркала возврат идёт на основной домен: у бота один домен, да и CDN зеркала
 * не пропустил бы подпись в адресе. Основной домен завершит вход и передаст
 * его на зеркало билетом; зеркало помнит путь возврата.
 */
export default defineEventHandler((event) => {
  const botId = telegramBotId()
  if (!botId) throw createError({ statusCode: 503, message: 'Телеграм-бот не настроен' })

  rememberNext(event)

  const mirror = viaMirror(event)
  const origin = mirror ? useRuntimeConfig(event).public.siteUrl : publicOrigin(event)
  const returnTo = mirror ? `${origin}/auth/telegram/done/${mirror}` : `${origin}/auth/telegram/done`

  return sendBrowserRedirect(event, 'https://oauth.telegram.org/auth'
    + `?bot_id=${botId}`
    + `&origin=${encodeURIComponent(origin)}`
    + `&return_to=${encodeURIComponent(returnTo)}`)
})
