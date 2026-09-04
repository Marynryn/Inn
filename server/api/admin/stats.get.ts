import { useDb } from '../../utils/db'
import { chapters, chapterStats, chapterViewDays, comments, gameStats, userIdentities, users } from '../../database/schema'
import { and, eq, desc, gte, sql, sum, count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user?.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Нет доступа' })
  }

  const db = useDb()

  const [totals] = await db
    .select({
      totalViews: sum(chapterStats.viewsCount),
      totalDownloads: sum(chapterStats.downloadsCount),
    })
    .from(chapterStats)

  const [commentCount] = await db.select({ total: count() }).from(comments)

  const [today] = await db
    .select({ total: sum(chapterViewDays.count) })
    .from(chapterViewDays)
    .where(eq(chapterViewDays.day, mskDay()))

  // Игра: сегодня и за всё время. Партии администраторов в счётчики не попадают —
  // их не пишут вовсе, отдельно фильтровать нечего.
  const gameRows = await db
    .select({
      day: gameStats.day,
      played: gameStats.played,
      won: gameStats.won,
      guesses: gameStats.guesses,
    })
    .from(gameStats)

  const sumRows = (rows: typeof gameRows) => rows.reduce(
    (acc, r) => ({
      played: acc.played + r.played,
      won: acc.won + r.won,
      guesses: acc.guesses + r.guesses,
    }),
    { played: 0, won: 0, guesses: 0 },
  )

  // Читатели. Отдельным запросом это намеренно не ходит: страница админки и так
  // делает шесть обращений при открытии, а здесь пара счётчиков по маленьким
  // таблицам — на фоне остального незаметно.
  const [readerTotal] = await db
    .select({ total: count() })
    .from(users)
    .where(eq(users.role, 'reader'))

  const [readerWeek] = await db
    .select({ total: count() })
    .from(users)
    .where(and(eq(users.role, 'reader'), gte(users.createdAt, sql`date('now', '-7 day')`)))

  const providerRows = await db
    .select({ provider: userIdentities.provider, total: count() })
    .from(userIdentities)
    .groupBy(userIdentities.provider)

  // Живые — те, кто хоть что-то сделал: написал комментарий, сыграл партию или
  // отметил главу прочитанной. Регистраций может быть двести, а говорящих пять,
  // и второе число куда честнее первого.
  const activeRows = await db.all<{ user_id: number }>(sql`
    SELECT user_id FROM comments WHERE user_id IS NOT NULL
    UNION SELECT user_id FROM game_results
    UNION SELECT user_id FROM reading_progress
  `)

  const topChapters = await db
    .select({
      id: chapters.id,
      title: chapters.title,
      publishedAt: chapters.publishedAt,
      sortOrder: chapters.sortOrder,
      views: chapterStats.viewsCount,
      downloads: chapterStats.downloadsCount,
    })
    .from(chapterStats)
    .innerJoin(chapters, eq(chapters.id, chapterStats.chapterId))
    .orderBy(desc(chapterStats.viewsCount))

  return {
    totalViews: Number(totals?.totalViews ?? 0),
    viewsToday: Number(today?.total ?? 0),
    totalDownloads: Number(totals?.totalDownloads ?? 0),
    totalComments: commentCount?.total ?? 0,
    game: {
      today: sumRows(gameRows.filter(r => r.day === mskDay())),
      total: sumRows(gameRows),
    },
    readers: {
      total: readerTotal?.total ?? 0,
      week: readerWeek?.total ?? 0,
      google: providerRows.find(r => r.provider === 'google')?.total ?? 0,
      telegram: providerRows.find(r => r.provider === 'telegram')?.total ?? 0,
      active: activeRows.length,
    },
    topChapters,
  }
})
