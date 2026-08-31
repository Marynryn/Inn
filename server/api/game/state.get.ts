import { isPool } from '../../utils/game-data'
import { currentSession, playerKey, sessionState } from '../../utils/game-session'

/** Текущая партия игрока. Начатой нет — заводится новая. */
export default defineEventHandler(async (event) => {
  const { mode, pool } = getQuery(event)

  const player = playerKey(event)
  const row = await currentSession(
    player,
    mode === 'endless' ? 'endless' : 'daily',
    isPool(pool) ? pool : 'known',
  )

  return sessionState(row)
})
