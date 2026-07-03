import { useDb } from '../../utils/db'
import { chapterStats } from '../../database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user?.role !== 'admin') throw createError({ statusCode: 403, message: 'Нет доступа' })

  const query = getQuery(event)
  if (query.confirm !== 'yes') {
    throw createError({
      statusCode: 400,
      message: 'Добавьте ?confirm=yes к ссылке, чтобы подтвердить сброс статистики (необратимо)',
    })
  }

  const db = useDb()
  const chapterId = query.chapterId ? String(query.chapterId) : null

  if (chapterId) {
    await db
      .update(chapterStats)
      .set({ viewsCount: 0, downloadsCount: 0 })
      .where(eq(chapterStats.chapterId, chapterId))
    return { ok: true, reset: chapterId }
  }

  await db.update(chapterStats).set({ viewsCount: 0, downloadsCount: 0 })
  return { ok: true, reset: 'all' }
})
