import { clampVolume, isPool } from '../../utils/game-data'
import { currentSession, dailyMaxVolume, playerKey, sessionState } from '../../utils/game-session'

/**
 * Текущая партия игрока. Начатой нет — заводится новая: у персонажа дня потолок
 * тома берётся из настроек сайта, у свободной игры — из запроса.
 */
export default defineEventHandler(async (event) => {
  const { mode, pool, maxVolume } = getQuery(event)
  const daily = mode !== 'endless'

  const player = playerKey(event)
  const row = await currentSession(
    player,
    daily ? 'daily' : 'endless',
    isPool(pool) ? pool : 'known',
    daily ? await dailyMaxVolume() : clampVolume(maxVolume),
  )

  return sessionState(row)
})
