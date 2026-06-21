import { useDb } from '../../utils/db'
import { chapters, chapterStats } from '../../database/schema'
import { eq, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, id))
  if (!chapter) throw createError({ statusCode: 404, message: 'Глава не найдена' })

  const session = await getUserSession(event)
  if (session.user?.role !== 'admin') {
    await db
      .insert(chapterStats)
      .values({ chapterId: id, viewsCount: 1, downloadsCount: 0 })
      .onConflictDoUpdate({
        target: chapterStats.chapterId,
        set: { viewsCount: sql`views_count + 1` },
      })
  }

  return chapter
})
