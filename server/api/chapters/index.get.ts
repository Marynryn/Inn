import { useDb } from '../../utils/db'
import { chapters, chapterStats } from '../../database/schema'
import { asc, eq } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db
    .select({
      id: chapters.id,
      volume: chapters.volume,
      title: chapters.title,
      publishedAt: chapters.publishedAt,
      sortOrder: chapters.sortOrder,
      viewsCount: chapterStats.viewsCount,
      downloadsCount: chapterStats.downloadsCount,
    })
    .from(chapters)
    .leftJoin(chapterStats, eq(chapterStats.chapterId, chapters.id))
    .orderBy(asc(chapters.sortOrder))

  return rows
})
