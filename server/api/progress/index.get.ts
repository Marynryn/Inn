import { desc, eq } from 'drizzle-orm'
import { chapters, readingProgress } from '../../database/schema'
import { useDb } from '../../utils/db'

/**
 * Закладка вошедшего читателя. Гостю отдаём пустую — у него всё в браузере, и
 * ходить за этим на сервер незачем.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = (session.user as { id?: number } | undefined)?.id
  if (!userId) return { lastRead: null, read: [], scroll: {} }

  const db = useDb()
  const rows = await db
    .select()
    .from(readingProgress)
    .where(eq(readingProgress.userId, userId))
    .orderBy(desc(readingProgress.updatedAt))

  // Последняя глава — самая свежая строка. Отдаём вместе с названием: плашка
  // «продолжить чтение» показывает его, а второго запроса ради этого не нужно.
  let lastRead: { id: string; title: string } | null = null
  if (rows[0]) {
    const [chapter] = await db
      .select({ id: chapters.id, title: chapters.title })
      .from(chapters)
      .where(eq(chapters.id, rows[0].chapterId))

    lastRead = chapter ?? null
  }

  return {
    lastRead,
    read: rows.filter(r => r.isRead).map(r => r.chapterId),
    scroll: Object.fromEntries(rows.filter(r => r.scroll > 0).map(r => [r.chapterId, r.scroll])),
  }
})
