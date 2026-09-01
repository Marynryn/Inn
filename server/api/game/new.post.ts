import { clampVolume, isPool } from '../../utils/game-data'
import { checkRateLimit } from '../../utils/rate-limit'
import { playerKey, sessionState, startEndless } from '../../utils/game-session'

/**
 * Новая партия в свободном режиме: тут игрок сам выбирает и набор, и потолок
 * тома. Персонаж дня так не перезапускается — он один на сутки для всех, и
 * потолок ему задаёт админка.
 */
export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  if (!checkRateLimit(`game-new:${ip}`, 20, 60_000)) {
    throw createError({ statusCode: 429, message: 'Слишком часто. Подожди минуту.' })
  }

  const body = await readBody<{ pool?: string; maxVolume?: number }>(event)
  const isAdmin = (await getUserSession(event)).user?.role === 'admin'
  const player = playerKey(event)
  const row = await startEndless(
    player,
    isPool(body?.pool) ? body.pool : 'known',
    clampVolume(body?.maxVolume),
    isAdmin,
  )

  return sessionState(row)
})
