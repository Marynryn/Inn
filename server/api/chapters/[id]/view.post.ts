import { useDb } from '../../../utils/db'
import { chapters, chapterStats, chapterViewDays } from '../../../database/schema'
import { eq, sql } from 'drizzle-orm'

/**
 * Просмотр главы. Его дёргает уже загруженная страница, а не серверный рендер:
 * скрапер, который просто скачал HTML и не выполняет JS, сюда не приходит.
 * Плюс отсев ботов по user-agent. Повторные заходы одного читателя считаются
 * заново — дедупликации по адресу нет, адреса мы не храним.
 */
export default defineEventHandler(async (event) => {
  const param = getRouterParam(event, 'id')!
  const db = useDb()

  const id = await resolveChapterId(db, param)
  if (!id) throw createError({ statusCode: 404, message: 'Глава не найдена' })

  const [chapter] = await db
    .select({ isPublished: chapters.isPublished })
    .from(chapters)
    .where(eq(chapters.id, id))

  if (!chapter?.isPublished) return { ok: true, counted: false }

  const session = await getUserSession(event)
  if (session.user?.role === 'admin' || isBotRequest(event)) return { ok: true, counted: false }

  // Обе записи одной транзакцией: порознь это два сброса на диск вместо одного.
  await db.batch([
    db
      .insert(chapterViewDays)
      .values({ chapterId: id, day: mskDay(), count: 1 })
      .onConflictDoUpdate({
        target: [chapterViewDays.chapterId, chapterViewDays.day],
        set: { count: sql`count + 1` },
      }),
    db
      .insert(chapterStats)
      .values({ chapterId: id, viewsCount: 1, downloadsCount: 0 })
      .onConflictDoUpdate({
        target: chapterStats.chapterId,
        set: { viewsCount: sql`views_count + 1` },
      }),
  ])

  return { ok: true, counted: true }
})
