import { checkRateLimit } from '../../utils/rate-limit'
import { applyGuess, currentSession, playerKey } from '../../utils/game-session'

/**
 * Попытка. Сравнение целиком на сервере: наружу уходит разбор названного
 * персонажа, а загаданный — только вместе с победой.
 */
export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  if (!checkRateLimit(`game-guess:${ip}`, 30, 60_000)) {
    throw createError({ statusCode: 429, message: 'Слишком часто. Подожди минуту.' })
  }

  const body = await readBody<{ mode?: string; id?: string }>(event)
  const id = String(body?.id ?? '').trim()
  if (!id) throw createError({ statusCode: 400, message: 'Не выбран персонаж' })

  const player = playerKey(event)
  const row = await currentSession(player, body?.mode === 'endless' ? 'endless' : 'daily', 'known')

  return applyGuess(row, id)
})
