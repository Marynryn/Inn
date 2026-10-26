import { sql } from 'drizzle-orm'
import { boardGameDays } from '../database/schema'
import { useDb } from '../utils/db'
import { setBoardFinishedHook } from '../utils/board-rooms'
import { mskDay } from '../utils/msk'

/** Доигранная партия настольной игры — строкой на день в board_game_days.
 *  Партии одних админов не считаем: это проба, а не игра. */
export default defineNitroPlugin(() => {
  setBoardFinishedHook((onlyAdmins) => {
    if (onlyAdmins) return
    useDb()
      .insert(boardGameDays)
      .values({ day: mskDay(), finished: 1 })
      .onConflictDoUpdate({ target: boardGameDays.day, set: { finished: sql`finished + 1` } })
      .catch(() => {})
  })
})
