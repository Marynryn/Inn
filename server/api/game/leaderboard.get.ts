import { and, desc, eq, gte } from 'drizzle-orm'
import type { GameMode } from '#shared/utils/gameColumns'
import { gameResults, users } from '../../database/schema'
import { useDb } from '../../utils/db'
import { monthStart, rankPlayers } from '../../utils/game-rating'
import { mskDay } from '../../utils/msk'

/**
 * Рейтинг игроков, отдельно по персонажу дня и по свободной игре. Считаются
 * только партии вошедших: партию без входа приписать некому, анонимный ключ
 * живёт в одном браузере.
 *
 * Играют все на равных, администраторы в том числе: таблица показывает, кто
 * сколько угадал, и вычёркивать из неё людей по должности незачем.
 *
 * Счёт идёт за текущий месяц: 1-го числа таблица начинается с чистого листа,
 * чтобы догнать первых было делом посильным, а не безнадёжным. Ничего при этом
 * не удаляется — сыгранные партии остаются в базе, а прошлые месяцы показывает
 * зал славы (api/game/champions).
 */

/**
 * Глубина, на которую смотрим назад ради серии побед: её месяц не обрывает —
 * серия длиной в полгода уже легенда, и терять её из-за календаря обидно.
 */
const WINDOW_DAYS = 180

/** Сколько строк отдаём. Дальше первой двадцатки таблицу никто не читает. */
const LIMIT = 20

const dayBefore = (days: number) =>
  new Date(Date.parse(`${mskDay()}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)

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
      avatarFrameId: users.avatarFrameId,
    })
    .from(gameResults)
    .innerJoin(users, eq(users.id, gameResults.userId))
    .where(and(
      eq(gameResults.mode, mode),
      gte(gameResults.day, dayBefore(WINDOW_DAYS)),
    ))
    .orderBy(desc(gameResults.day))

  const ranked = await rankPlayers(rows, { since: monthStart(), myId, withStreak: true })

  const top = ranked.slice(0, LIMIT)
  const mine = ranked.find(r => r.me)

  // Свою строку человек должен видеть всегда: не попал в двадцатку — дописываем
  // её последней, вместе с настоящим местом.
  return mine && mine.place > LIMIT ? [...top, mine] : top
})
