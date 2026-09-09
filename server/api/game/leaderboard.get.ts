import { and, desc, eq, gte, ne } from 'drizzle-orm'
import type { GameMode } from '#shared/utils/gameColumns'
import { gameResults, users } from '../../database/schema'
import { useDb } from '../../utils/db'
import { readerName } from '../../utils/identity'
import { mskDay } from '../../utils/msk'

/**
 * Рейтинг игроков, отдельно по персонажу дня и по свободной игре. Считаются
 * только партии вошедших: партию без входа приписать некому, анонимный ключ
 * живёт в одном браузере.
 *
 * Партии администраторов не показываем — мы гоняем игру чаще всех, и первое
 * место досталось бы нам по построению, а не по заслугам. В базе они остаются:
 * это вопрос показа, а не учёта.
 */

/** Глубина, на которую смотрим назад. Серия длиннее полугода — уже легенда. */
const WINDOW_DAYS = 180

/** Сколько строк отдаём. Дальше первой двадцатки таблицу никто не читает. */
const LIMIT = 20

const dayBefore = (days: number) => {
  const date = new Date(Date.parse(`${mskDay()}T00:00:00Z`) - days * 86_400_000)
  return date.toISOString().slice(0, 10)
}

/** Длина серии подряд идущих побед, считая от самого свежего дня. */
function streakOf(winDays: string[]): number {
  if (!winDays.length) return 0

  const days = [...new Set(winDays)].sort().reverse()
  const today = mskDay()
  const yesterday = dayBefore(1)

  // Серия жива, пока последняя победа — сегодня или вчера: пропущенный день её
  // обрывает, но сегодняшнюю партию человек мог ещё не сыграть.
  if (days[0] !== today && days[0] !== yesterday) return 0

  let streak = 1
  for (let i = 1; i < days.length; i++) {
    const expected = new Date(Date.parse(`${days[i - 1]}T00:00:00Z`) - 86_400_000)
      .toISOString().slice(0, 10)

    if (days[i] !== expected) break
    streak++
  }

  return streak
}

export default defineEventHandler(async (event) => {
  // Два рейтинга, а не один: персонаж дня у всех общий и партия там одна в
  // сутки, а свободных партий человек играет сколько захочет — мерить их одной
  // таблицей нечестно.
  const mode: GameMode = getQuery(event).mode === 'endless' ? 'endless' : 'daily'
  const db = useDb()

  // Кто смотрит: свою строку в таблице отмечаем, чтобы её было видно сразу.
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
    })
    .from(gameResults)
    .innerJoin(users, eq(users.id, gameResults.userId))
    .where(and(
      eq(gameResults.mode, mode),
      gte(gameResults.day, dayBefore(WINDOW_DAYS)),
      ne(users.role, 'admin'),
    ))
    .orderBy(desc(gameResults.day))
    .orderBy(desc(gameResults.day))

  type Player = {
    userId: number
    name: string
    avatarUrl: string | null
    played: number
    wins: number
    winGuesses: number
    winDays: string[]
  }

  const players = new Map<number, Player>()

  for (const row of rows) {
    let player = players.get(row.userId)
    if (!player) {
      player = {
        userId: row.userId,
        name: readerName(row),
        avatarUrl: row.avatarUrl,
        played: 0,
        wins: 0,
        winGuesses: 0,
        winDays: [],
      }
      players.set(row.userId, player)
    }

    player.played++
    if (row.won) {
      player.wins++
      player.winGuesses += row.guesses
      player.winDays.push(row.day)
    }
  }

  const ranked = [...players.values()]
    .map(p => ({
      me: p.userId === myId,
      name: p.name,
      avatarUrl: p.avatarUrl,
      played: p.played,
      wins: p.wins,
      // Среднее — по выигранным партиям: попытки сдавшихся сюда мешать нельзя.
      averageGuesses: p.wins ? Math.round((p.winGuesses / p.wins) * 10) / 10 : 0,
      streak: streakOf(p.winDays),
    }))
    // Побед больше — выше. Поровну — выигрывает тот, кто угадывал с меньшего
    // числа попыток: иначе таблица зависела бы только от усидчивости.
    .sort((a, b) => b.wins - a.wins || a.averageGuesses - b.averageGuesses || b.streak - a.streak)
    .map((row, i) => ({ place: i + 1, ...row }))

  const top = ranked.slice(0, LIMIT)
  const mine = ranked.find(r => r.me)

  // Свою строку человек должен видеть всегда: не попал в двадцатку — дописываем
  // её последней, вместе с настоящим местом.
  return mine && mine.place > LIMIT ? [...top, mine] : top
})
