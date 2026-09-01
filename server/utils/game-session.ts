import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { and, desc, eq, sql } from 'drizzle-orm'
import { GAME_LAST_VOLUME, type GameMode, type GameStatus } from '#shared/utils/gameColumns'
import { gameDailyStats, gameSessions, siteSettings } from '../database/schema'
import { useDb } from './db'
import { MSK_OFFSET_MS, mskDay } from './msk'
import { DAILY_POOL, clampVolume, dailyCharacter, findAnyCharacter, findCharacter, poolCharacters, randomCharacter, type Pool } from './game-data'
import { buildAnswerCard, buildGuessRow, visibleColumns } from './game-round'

/**
 * Партии игры. Ответ, список попыток и статус лежат в базе; браузер держит
 * только анонимную куку-ключ. Подменить состояние с клиента нельзя — там нет
 * ничего, кроме идентификатора игрока.
 */

const PLAYER_COOKIE = 'wi_player'

/** Потолок попыток на партию: и от бесконечной таблицы, и от перебора базы ботом. */
export const MAX_GUESSES = 100

type SessionRow = typeof gameSessions.$inferSelect

export function playerKey(event: H3Event): string {
  const existing = getCookie(event, PLAYER_COOKIE)
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing

  const key = randomUUID()
  setCookie(event, PLAYER_COOKIE, key, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return key
}

const parseGuesses = (row: SessionRow): string[] => {
  try {
    const parsed = JSON.parse(row.guesses)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Момент смены персонажа дня — ближайшая полночь по Москве. */
export const nextDailyAt = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000 - MSK_OFFSET_MS).toISOString()

/**
 * Потолок тома для персонажа дня. Он один на всех и задаётся в админке: держать
 * его на границе перевода — единственный способ не спойлерить тем, кто читает
 * только нас. В свободной игре потолок выбирает сам игрок.
 */
export async function dailyMaxVolume(): Promise<number> {
  const db = useDb()
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, 'game_max_volume'))

  return clampVolume(row?.value ?? GAME_LAST_VOLUME)
}

async function createDaily(player: string, day: string): Promise<SessionRow> {
  const db = useDb()
  const maxVolume = await dailyMaxVolume()
  const answer = await dailyCharacter(day, maxVolume)

  await db.batch([
    db
      .insert(gameSessions)
      .values({ player, mode: 'daily', pool: DAILY_POOL, maxVolume, day, answerId: answer.id })
      .onConflictDoNothing(),
    db
      .insert(gameDailyStats)
      .values({ day, played: 1, won: 0, guesses: 0 })
      .onConflictDoUpdate({ target: gameDailyStats.day, set: { played: sql`played + 1` } }),
  ])

  const [row] = await db
    .select()
    .from(gameSessions)
    .where(and(eq(gameSessions.player, player), eq(gameSessions.mode, 'daily'), eq(gameSessions.day, day)))

  return row!
}

async function createEndless(player: string, pool: Pool, maxVolume: number): Promise<SessionRow> {
  const db = useDb()
  const cap = clampVolume(maxVolume)
  const answer = await randomCharacter(pool, cap)

  // Прошлые свободные партии не храним: их незачем показывать и незачем возвращать.
  await db
    .delete(gameSessions)
    .where(and(eq(gameSessions.player, player), eq(gameSessions.mode, 'endless')))

  const [row] = await db
    .insert(gameSessions)
    .values({ player, mode: 'endless', pool, maxVolume: cap, day: mskDay(), answerId: answer.id })
    .returning()

  return row!
}

/** Текущая партия игрока: находит начатую или заводит новую. */
export async function currentSession(
  player: string,
  mode: GameMode,
  pool: Pool,
  maxVolume = GAME_LAST_VOLUME,
): Promise<SessionRow> {
  const db = useDb()

  if (mode === 'daily') {
    const day = mskDay()
    const [row] = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.player, player), eq(gameSessions.mode, 'daily'), eq(gameSessions.day, day)))

    return row ?? await createDaily(player, day)
  }

  const [row] = await db
    .select()
    .from(gameSessions)
    .where(and(eq(gameSessions.player, player), eq(gameSessions.mode, 'endless')))
    .orderBy(desc(gameSessions.id))
    .limit(1)

  return row ?? await createEndless(player, pool, maxVolume)
}

export const startEndless = createEndless

async function dailySummary(day: string) {
  const db = useDb()
  const [row] = await db.select().from(gameDailyStats).where(eq(gameDailyStats.day, day))

  return {
    played: row?.played ?? 0,
    won: row?.won ?? 0,
    averageGuesses: row?.won ? Math.round((row.guesses / row.won) * 10) / 10 : 0,
  }
}

async function sessionAnswer(row: SessionRow) {
  const answer = await findAnyCharacter(row.answerId)
  if (!answer) throw createError({ statusCode: 500, message: 'Загаданный персонаж пропал из базы' })
  return answer
}

/** Полное состояние партии для страницы. Ответ подмешивается только доигранным. */
export async function sessionState(row: SessionRow) {
  const guessIds = parseGuesses(row)
  const answer = await sessionAnswer(row)
  const finished = row.status !== 'playing'

  const rows = []
  for (const id of guessIds) {
    const guess = await findAnyCharacter(id)
    if (guess) rows.push(await buildGuessRow(guess, answer, row.maxVolume))
  }

  return {
    mode: row.mode as GameMode,
    pool: row.pool as Pool,
    maxVolume: row.maxVolume,
    columns: visibleColumns(row.maxVolume),
    status: row.status as GameStatus,
    day: row.day,
    guesses: rows.reverse(), // свежая попытка сверху
    poolSize: (await poolCharacters(row.pool, row.maxVolume)).length,
    answer: finished ? await buildAnswerCard(answer, row.maxVolume) : null,
    nextDailyAt: row.mode === 'daily' ? nextDailyAt(row.day) : null,
    daily: row.mode === 'daily' ? await dailySummary(row.day) : null,
  }
}

/** Записывает попытку и, если угадали, закрывает партию. */
export async function applyGuess(row: SessionRow, guessId: string) {
  const db = useDb()

  if (row.status !== 'playing') {
    throw createError({ statusCode: 409, message: 'Партия уже закончена' })
  }

  const guessed = parseGuesses(row)
  if (guessed.includes(guessId)) {
    throw createError({ statusCode: 409, message: 'Этого персонажа уже называли' })
  }
  if (guessed.length >= MAX_GUESSES) {
    throw createError({ statusCode: 429, message: 'Слишком много попыток в одной партии' })
  }

  // Потолок тома проверяем и здесь: подсказки его учитывают, но запрос можно
  // послать и мимо страницы, а через ответ по чужому персонажу утекли бы признаки.
  const guess = await findCharacter(guessId, row.pool, row.maxVolume)
  if (!guess) throw createError({ statusCode: 404, message: 'Такого персонажа нет в наборе' })

  const answer = await sessionAnswer(row)
  const won = guess.id === answer.id
  const guesses = [...guessed, guess.id]

  await db
    .update(gameSessions)
    .set({
      guesses: JSON.stringify(guesses),
      status: won ? 'won' : 'playing',
      finishedAt: won ? new Date().toISOString() : null,
    })
    .where(eq(gameSessions.id, row.id))

  if (won && row.mode === 'daily') {
    await db
      .insert(gameDailyStats)
      .values({ day: row.day, played: 1, won: 1, guesses: guesses.length })
      .onConflictDoUpdate({
        target: gameDailyStats.day,
        set: { won: sql`won + 1`, guesses: sql`guesses + ${guesses.length}` },
      })
  }

  return {
    row: await buildGuessRow(guess, answer, row.maxVolume),
    status: (won ? 'won' : 'playing') as GameStatus,
    answer: won ? await buildAnswerCard(answer, row.maxVolume) : null,
    daily: row.mode === 'daily' ? await dailySummary(row.day) : null,
  }
}

/** Сдаться: партия закрывается, ответ показывается. */
export async function revealAnswer(row: SessionRow) {
  const db = useDb()

  if (row.status === 'playing') {
    await db
      .update(gameSessions)
      .set({ status: 'revealed', finishedAt: new Date().toISOString() })
      .where(eq(gameSessions.id, row.id))
  }

  return { ...row, status: 'revealed' as const }
}
