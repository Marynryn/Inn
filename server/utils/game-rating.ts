import type { AvatarFrame } from '#shared/utils/avatarFrames'
import { framesByIds } from './frames'
import { readerName } from './identity'
import { mskDay } from './msk'

/**
 * Подсчёт рейтинга игры. Живёт отдельно от обработчиков, потому что считают его
 * двое: таблица текущего месяца и зал славы за прошлые. Мерка должна быть одна,
 * иначе чемпион месяца разойдётся с тем, кто в этом месяце был первым.
 */

export interface RatingRow {
  userId: number
  day: string
  won: boolean
  guesses: number
  displayName: string | null
  email: string | null
  avatarUrl: string | null
  avatarFrameId: number | null
}

export interface RankedPlayer {
  place: number
  me: boolean
  name: string
  avatarUrl: string | null
  avatarFrame: AvatarFrame | null
  played: number
  wins: number
  averageGuesses: number
  streak: number
}

/** Первый день месяца, в котором идёт счёт, по Москве: '2026-09-01'. */
export const monthStart = (day: string = mskDay()) => `${day.slice(0, 7)}-01`

const dayBefore = (days: number, from: string = mskDay()) =>
  new Date(Date.parse(`${from}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)

/** Длина серии подряд идущих побед, считая от самого свежего дня. */
export function streakOf(winDays: string[]): number {
  if (!winDays.length) return 0

  const days = [...new Set(winDays)].sort().reverse()
  const today = mskDay()
  const yesterday = dayBefore(1)

  // Серия жива, пока последняя победа — сегодня или вчера: пропущенный день её
  // обрывает, но сегодняшнюю партию человек мог ещё не сыграть.
  if (days[0] !== today && days[0] !== yesterday) return 0

  let streak = 1
  for (let i = 1; i < days.length; i++) {
    const expected = dayBefore(1, days[i - 1]!)
    if (days[i] !== expected) break
    streak++
  }

  return streak
}

/**
 * Места по партиям. В счёт идут только дни от `since` до `until` включительно;
 * партии вне этого отрезка нужны разве что серии — она календарь не признаёт,
 * и обрывать её на первом числе было бы обидно.
 */
export async function rankPlayers(
  rows: RatingRow[],
  { since, until, myId = null, withStreak = false }: {
    since: string
    until?: string
    myId?: number | null
    withStreak?: boolean
  },
): Promise<RankedPlayer[]> {
  type Player = {
    userId: number
    name: string
    avatarUrl: string | null
    avatarFrameId: number | null
    played: number
    wins: number
    winGuesses: number
    winDays: string[]
  }

  const players = new Map<number, Player>()

  for (const row of rows) {
    const counts = row.day >= since && (!until || row.day <= until)

    // Партия вне отрезка сама по себе человека в таблицу не приводит: она нужна
    // только тому, кто в отрезке уже играл, и только ради серии.
    if (!counts && !players.has(row.userId)) continue

    let player = players.get(row.userId)
    if (!player) {
      player = {
        userId: row.userId,
        name: readerName(row),
        avatarUrl: row.avatarUrl,
        avatarFrameId: row.avatarFrameId,
        played: 0,
        wins: 0,
        winGuesses: 0,
        winDays: [],
      }
      players.set(row.userId, player)
    }

    if (row.won) player.winDays.push(row.day)
    if (!counts) continue

    player.played++
    if (row.won) {
      player.wins++
      player.winGuesses += row.guesses
    }
  }

  const frames = await framesByIds([...players.values()].map(p => p.avatarFrameId))

  return [...players.values()]
    .map(p => ({
      me: p.userId === myId,
      name: p.name,
      avatarUrl: p.avatarUrl,
      avatarFrame: frames.get(p.avatarFrameId ?? 0) ?? null,
      played: p.played,
      wins: p.wins,
      // Среднее — по выигранным партиям: попытки сдавшихся сюда мешать нельзя.
      averageGuesses: p.wins ? Math.round((p.winGuesses / p.wins) * 10) / 10 : 0,
      streak: withStreak ? streakOf(p.winDays) : 0,
    }))
    // Побед больше — выше. Поровну — выигрывает тот, кто угадывал с меньшего
    // числа попыток: иначе таблица зависела бы только от усидчивости.
    .sort((a, b) => b.wins - a.wins || a.averageGuesses - b.averageGuesses || b.streak - a.streak)
    .map((row, i) => ({ place: i + 1, ...row }))
}
