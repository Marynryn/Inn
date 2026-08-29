import { getLastNotifyAt, notifyChapters } from '../../utils/notify-chapters'
import { MSK_OFFSET_MS } from '../../utils/msk'

// Защита только от двойного срабатывания (два запуска крона одновременно).
// От повторов про одну и ту же главу защищает notifiedAt, поэтому длинное окно
// здесь не нужно: раньше 20-часовой лимит съедал следующий законный запуск,
// стоило GitHub'у один раз опоздать, и время рассылки уезжало день ото дня.
const MIN_INTERVAL_MS = 10 * 60 * 1000

// Расписание GitHub Actions — «по возможности»: запуск может опоздать на часы.
// Опоздавший запуск не должен будить читателей ночью, поэтому шлём только в окно
// по Москве; пропущенную главу подхватит следующая попытка. Ручная отправка из
// админки идёт мимо окна — там время выбирает админ.
const WINDOW_START_HOUR = 9
const WINDOW_END_HOUR = 22

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const { secret } = getQuery(event)
  if (!config.notifySecret || secret !== config.notifySecret) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  const mskHour = new Date(Date.now() + MSK_OFFSET_MS).getUTCHours()
  if (mskHour < WINDOW_START_HOUR || mskHour >= WINDOW_END_HOUR) {
    return { ok: true, notified: false, reason: 'outside-window', mskHour }
  }

  const lastNotifyAt = await getLastNotifyAt()
  if (lastNotifyAt && Date.now() - new Date(lastNotifyAt).getTime() < MIN_INTERVAL_MS) {
    return { ok: true, notified: false, reason: 'just-sent' }
  }

  const result = await notifyChapters({ touchLastNotify: true })

  return { ok: true, notified: result.notified, count: result.count, reason: result.reason }
})
