import { useDb } from '../../utils/db'
import { comments, chapters } from '../../database/schema'
import { desc, leftJoin, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user?.role !== 'admin') throw createError({ statusCode: 403 })

  const db = useDb()

  const rows = await db
    .select({
      id: comments.id,
      authorName: comments.authorName,
      body: comments.body,
      isSpoiler: comments.isSpoiler,
      chapterId: comments.chapterId,
      chapterTitle: chapters.title,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .leftJoin(chapters, eq(comments.chapterId, chapters.id))
    .orderBy(desc(comments.createdAt))
    .limit(50)

  return rows
})
