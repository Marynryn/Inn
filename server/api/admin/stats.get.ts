import { useDb } from '../../utils/db'
import { chapters, chapterStats, comments } from '../../database/schema'
import { eq, desc, sum, count } from 'drizzle-orm'

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

  const topChapters = await db
    .select({
      id: chapters.id,
      title: chapters.title,
      views: chapterStats.viewsCount,
      downloads: chapterStats.downloadsCount,
    })
    .from(chapterStats)
    .innerJoin(chapters, eq(chapters.id, chapterStats.chapterId))
    .orderBy(desc(chapterStats.viewsCount))
    .limit(10)

  return {
    totalViews: Number(totals?.totalViews ?? 0),
    totalDownloads: Number(totals?.totalDownloads ?? 0),
    totalComments: commentCount?.total ?? 0,
    topChapters,
  }
})
