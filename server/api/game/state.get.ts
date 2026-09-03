import { clampVolume, isPool } from '../../utils/game-data'
import { currentSession, dailyMaxVolume, playerIdentity, sessionState } from '../../utils/game-session'

/**
 * Текущая партия игрока. Начатой нет — заводится новая: у персонажа дня потолок
 * тома берётся из настроек сайта, у свободной игры — из запроса.
 */
export default defineEventHandler(async (event) => {
  const { mode, pool, maxVolume } = getQuery(event)
  const daily = mode !== 'endless'

  const { player, userId, isAdmin } = await playerIdentity(event)
  const row = await currentSession(
    player,
    daily ? 'daily' : 'endless',
    isPool(pool) ? pool : 'known',
    daily ? await dailyMaxVolume() : clampVolume(maxVolume),
    isAdmin,
    userId,
  )

  return sessionState(row)
})
