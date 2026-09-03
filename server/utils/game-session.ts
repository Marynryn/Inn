import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { and, desc, eq, max, sql } from 'drizzle-orm'
import { GAME_LAST_VOLUME, type GameMode, type GameStatus } from '#shared/utils/gameColumns'
import { chapters, gameResults, gameSessions, gameStats, siteSettings } from '../database/schema'
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

/**
 * Кто играет. Кука отвечает за партию, аккаунт — за достижения: без входа
 * ранжировать некого, анонимный ключ живёт в одном браузере и меняется вместе
 * с ним.
 */
export async function playerIdentity(event: H3Event) {
  const session = await getUserSession(event)
  const user = session.user as { id?: number; role?: string } | undefined

  return {
    player: playerKey(event),
    userId: user?.id ?? null,
    isAdmin: user?.role === 'admin',
  }
}

/**
 * Записывает завершённую партию в достижения. Партии без аккаунта пропускаем:
 * приписать их некому. Партия дня одна на сутки — повторную вставку база
 * отклоняет сама, и это ровно то поведение, которое нужно.
 */
async function recordResult(row: SessionRow, won: boolean, guesses: number) {
  if (!row.userId) return

  const db = useDb()
  await db
    .insert(gameResults)
    .values({ userId: row.userId, day: row.day, mode: row.mode as GameMode, guesses, won })
    .onConflictDoNothing()
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
 * Граница перевода: самый поздний том среди опубликованных глав. Пока настройка
 * пуста, игра держится за неё сама — дошёл перевод до пятого тома, и персонаж
 * дня начинает брать оттуда же. Глав нет вовсе (пустой сайт) — прятать не от
 * кого, отдаём весь диапазон.
 */
async function translatedVolume(): Promise<number> {
  const db = useDb()
  const [row] = await db
    .select({ volume: max(chapters.volume) })
    .from(chapters)
    .where(eq(chapters.isPublished, true))

  return row?.volume ? clampVolume(row.volume) : GAME_LAST_VOLUME
}

/**
 * Потолок тома для персонажа дня — один на всех. Пустая настройка означает «по
 * переводу», число — ручной потолок.
 *
 * Внутри дня потолок не меняется: если партии на сегодня уже заводили, берём его
 * оттуда. Иначе публикация главы нового тома посреди дня выдала бы опоздавшим
 * игрокам другого персонажа, чем тем, кто сыграл утром.
 */
const DAY_CAP_KEY = 'game_day_cap' // значение вида '2026-09-01:4'

const setting = async (key: string) => {
  const db = useDb()
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key))

  return row?.value ?? ''
}

export async function dailyMaxVolume(day = mskDay()): Promise<number> {
  // Потолок дня, если он уже зафиксирован. Держим его отдельной записью, а не
  // вычитываем из начатых партий: у старых партий столбца потолка не было вовсе,
  // и одна такая строка задавала бы всему дню неверное значение.
  const [frozenDay, frozenCap] = (await setting(DAY_CAP_KEY)).split(':')
  if (frozenDay === day && Number(frozenCap) >= 1) return clampVolume(frozenCap)

  const manual = Number(await setting('game_max_volume'))
  return manual >= 1 ? clampVolume(manual) : translatedVolume()
}

/**
 * Фиксирует потолок за днём — вызывается, когда заводится первая партия дня.
 * Дальше он не меняется, даже если выложить главу нового тома в обед: иначе
 * опоздавшие получили бы другого персонажа, чем те, кто сыграл утром.
 */
async function freezeDailyCap(day: string, cap: number) {
  const db = useDb()
  await db
    .insert(siteSettings)
    .values({ key: DAY_CAP_KEY, value: `${day}:${cap}` })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: `${day}:${cap}` } })
}

/**
 * Плюс к счётчикам за день. Партии администраторов не считаем вовсе: игру гоняем
 * мы сами чаще всех, и в статистике это только шум.
 */
async function bumpStats(
  day: string,
  mode: GameMode,
  isAdmin: boolean,
  add: Partial<Record<'played' | 'won' | 'guesses' | 'winGuesses', number>>,
) {
  if (isAdmin) return

  const db = useDb()
  const { played = 0, won = 0, guesses = 0, winGuesses = 0 } = add

  await db
    .insert(gameStats)
    .values({ day, mode, played, won, guesses, winGuesses })
    .onConflictDoUpdate({
      target: [gameStats.day, gameStats.mode],
      set: {
        played: sql`played + ${played}`,
        won: sql`won + ${won}`,
        guesses: sql`guesses + ${guesses}`,
        winGuesses: sql`win_guesses + ${winGuesses}`,
      },
    })
}

async function createDaily(player: string, day: string, isAdmin: boolean, userId: number | null): Promise<SessionRow> {
  const db = useDb()
  const maxVolume = await dailyMaxVolume(day)
  await freezeDailyCap(day, maxVolume)

  const answer = await dailyCharacter(day, maxVolume)

  await db
    .insert(gameSessions)
    .values({ player, userId, mode: 'daily', pool: DAILY_POOL, maxVolume, day, answerId: answer.id })
    .onConflictDoNothing()

  await bumpStats(day, 'daily', isAdmin, { played: 1 })

  const [row] = await db
    .select()
    .from(gameSessions)
    .where(and(eq(gameSessions.player, player), eq(gameSessions.mode, 'daily'), eq(gameSessions.day, day)))

  return row!
}

async function createEndless(
  player: string,
  pool: Pool,
  maxVolume: number,
  isAdmin = false,
  userId: number | null = null,
): Promise<SessionRow> {
  const db = useDb()
  const cap = clampVolume(maxVolume)
  const answer = await randomCharacter(pool, cap)
  const day = mskDay()

  await bumpStats(day, 'endless', isAdmin, { played: 1 })

  // Прошлые свободные партии не храним: их незачем показывать и незачем возвращать.
  await db
    .delete(gameSessions)
    .where(and(eq(gameSessions.player, player), eq(gameSessions.mode, 'endless')))

  const [row] = await db
    .insert(gameSessions)
    .values({ player, userId, mode: 'endless', pool, maxVolume: cap, day, answerId: answer.id })
    .returning()

  return row!
}

/**
 * Партия, начатая до входа, аккаунта не знает. Пришёл человек, вошёл и вернулся
 * в игру — приписываем ей его: иначе сегодняшняя партия не попала бы в
 * достижения только из-за того, что войти догадались в середине дня.
 */
async function claimSession(row: SessionRow, userId: number | null): Promise<SessionRow> {
  if (!userId || row.userId) return row

  const db = useDb()
  await db.update(gameSessions).set({ userId }).where(eq(gameSessions.id, row.id))

  return { ...row, userId }
}

/** Текущая партия игрока: находит начатую или заводит новую. */
export async function currentSession(
  player: string,
  mode: GameMode,
  pool: Pool,
  maxVolume = GAME_LAST_VOLUME,
  isAdmin = false,
  userId: number | null = null,
): Promise<SessionRow> {
  const db = useDb()

  if (mode === 'daily') {
    const day = mskDay()
    const [row] = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.player, player), eq(gameSessions.mode, 'daily'), eq(gameSessions.day, day)))

    return row ? claimSession(row, userId) : createDaily(player, day, isAdmin, userId)
  }

  const [row] = await db
    .select()
    .from(gameSessions)
    .where(and(eq(gameSessions.player, player), eq(gameSessions.mode, 'endless')))
    .orderBy(desc(gameSessions.id))
    .limit(1)

  return row ? claimSession(row, userId) : createEndless(player, pool, maxVolume, isAdmin, userId)
}

export const startEndless = createEndless

/** Строчка «сегодня угадали N игроков» — только про персонажа дня. */
async function dailySummary(day: string) {
  const db = useDb()
  const [row] = await db
    .select()
    .from(gameStats)
    .where(and(eq(gameStats.day, day), eq(gameStats.mode, 'daily')))

  return {
    played: row?.played ?? 0,
    won: row?.won ?? 0,
    // Среднее считаем по победителям: попытки проигравших сюда мешать нельзя.
    averageGuesses: row?.won ? Math.round((row.winGuesses / row.won) * 10) / 10 : 0,
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
export async function applyGuess(row: SessionRow, guessId: string, isAdmin = false) {
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

  await bumpStats(row.day, row.mode as GameMode, isAdmin, {
    guesses: 1,
    ...(won ? { won: 1, winGuesses: guesses.length } : {}),
  })

  if (won) await recordResult(row, true, guesses.length)

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

    // Сдача — тоже сыгранная партия: в рейтинге она считается попыткой без
    // победы, иначе процент угадываний считался бы только по удачным дням.
    await recordResult(row, false, parseGuesses(row).length)
  }

  return { ...row, status: 'revealed' as const }
}
