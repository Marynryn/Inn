import { isPool } from '../../utils/game-data'
import { checkRateLimit } from '../../utils/rate-limit'
import { playerKey, sessionState, startEndless } from '../../utils/game-session'

/**
 * Новая партия в свободном режиме. Персонаж дня так не перезапускается: он один
 * на сутки для всех, иначе смысл теряется.
 */
export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  if (!checkRateLimit(`game-new:${ip}`, 20, 60_000)) {
    throw createError({ statusCode: 429, message: 'Слишком часто. Подожди минуту.' })
  }

  const body = await readBody<{ pool?: string }>(event)
  const player = playerKey(event)
  const row = await startEndless(player, isPool(body?.pool) ? body.pool : 'known')

  return sessionState(row)
})
