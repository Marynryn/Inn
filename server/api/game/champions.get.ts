import { desc, eq } from 'drizzle-orm'
import type { GameMode } from '#shared/utils/gameColumns'
import { gameResults, users } from '../../database/schema'
import { useDb } from '../../utils/db'
import { monthStart, rankPlayers } from '../../utils/game-rating'

/**
 * Зал славы: кто был первым в каждом прошедшем месяце. Рейтинг обнуляется 1-го
 * числа, и без этой памяти победа исчезала бы вместе с таблицей.
 *
 * Считается на лету из тех же партий, а не снимком по расписанию: задача,
 * не сработавшая в ночь на первое (деплой, перезапуск), унесла бы месяц с
 * собой, а так его всегда можно посчитать заново.
 */

/** Сколько месяцев помним. Год назад — уже история, дальше листать незачем. */
const MONTHS = 12

/** Последний день месяца '2026-08' → '2026-08-31'. */
const monthEnd = (month: string) => {
  const [year, mon] = month.split('-').map(Number)
  return new Date(Date.UTC(year!, mon!, 0)).toISOString().slice(0, 10)
}

export default defineEventHandler(async (event) => {
  const mode: GameMode = getQuery(event).mode === 'endless' ? 'endless' : 'daily'
  const db = useDb()

  const session = await getUserSession(event)
  const myId = (session.user as { id?: number } | undefined)?.id ?? null

  const rows = await db
    .select({
      userId: gameResults.userId,
      day: gameResults.day,
      won: gameResults.won,
      guesses: gameResults.guesses,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      avatarFrameId: users.avatarFrameId,
    })
    .from(gameResults)
    .innerJoin(users, eq(users.id, gameResults.userId))
    .where(eq(gameResults.mode, mode))
    .orderBy(desc(gameResults.day))

  // Текущий месяц в зал славы не идёт: он ещё не сыгран, и его показывает
  // сама таблица.
  const current = monthStart()
  const byMonth = new Map<string, typeof rows>()

  for (const row of rows) {
    if (row.day >= current) continue
    const month = row.day.slice(0, 7)
    if (!byMonth.has(month)) byMonth.set(month, [])
    byMonth.get(month)!.push(row)
  }

  const months = [...byMonth.keys()].sort().reverse().slice(0, MONTHS)

  const champions = []
  for (const month of months) {
    const ranked = await rankPlayers(byMonth.get(month)!, {
      since: `${month}-01`,
      until: monthEnd(month),
      myId,
    })

    // Месяц, в котором никто не угадал ни разу, чемпиона не даёт: строка
    // «победитель — ноль побед» ничего не говорит.
    const winner = ranked[0]
    if (!winner?.wins) continue

    champions.push({ month, ...winner })
  }

  return champions
})
