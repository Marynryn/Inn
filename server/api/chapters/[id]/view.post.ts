import { useDb } from '../../../utils/db'
import { chapters, chapterStats, chapterViews } from '../../../database/schema'
import { and, eq, sql } from 'drizzle-orm'

/**
 * Просмотр главы. Его дёргает уже загруженная страница, а не серверный рендер:
 * скрапер, который просто скачал HTML и не выполняет JS, сюда не приходит.
 * Сверху — отсев ботов по user-agent и один просмотр с адреса в сутки.
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

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const day = new Date().toISOString().slice(0, 10)

  const [seen] = await db
    .select({ id: chapterViews.id })
    .from(chapterViews)
    .where(and(eq(chapterViews.chapterId, id), eq(chapterViews.ip, ip), eq(chapterViews.day, day)))

  if (seen) return { ok: true, counted: false }

  // Уникальный индекс подстрахует, если две вкладки откроют главу одновременно.
  await db.insert(chapterViews).values({ chapterId: id, ip, day }).onConflictDoNothing()

  await db
    .insert(chapterStats)
    .values({ chapterId: id, viewsCount: 1, downloadsCount: 0 })
    .onConflictDoUpdate({
      target: chapterStats.chapterId,
      set: { viewsCount: sql`views_count + 1` },
    })

  return { ok: true, counted: true }
})
