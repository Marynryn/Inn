import { mirrorHosts } from '../../../../utils/public-origin'
import { finishTelegramLogin } from '../../../../utils/telegram-login'

/**
 * Возврат от телеграма для входа, начатого на зеркале. Какое зеркало — в пути,
 * а не в query: телеграм дописывает к адресу возврата свои поля, и второй
 * вопросительный знак ломал бы строку запроса. Чужой хост — 404.
 */
export default defineEventHandler((event) => {
  const mirror = String(getRouterParam(event, 'mirror') ?? '').toLowerCase()
  if (!mirrorHosts().includes(mirror)) throw createError({ statusCode: 404, message: 'Неизвестное зеркало' })
  return finishTelegramLogin(event, mirror)
})
