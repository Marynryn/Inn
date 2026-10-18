import { desc, eq } from 'drizzle-orm'
import { chapters, readingProgress, users } from '../../../../database/schema'
import { useDb } from '../../../../utils/db'

/**
 * Закладки читателя для админки: какие главы открывал, докуда дочитал и когда.
 * Доступ — только администратору (его проверяет admin-guard на всём /api/admin).
 * Читатель — по публичному коду, как на его странице и в соседнем about.delete.
 *
 * Свежие сверху: первая строка — то, что он читает сейчас.
 */
export default defineEventHandler(async (event) => {
  const code = String(getRouterParam(event, 'code') ?? '')
  if (!/^[0-9a-f]{12}$/.test(code)) throw createError({ statusCode: 400, message: 'Не выбран читатель' })

  const db = useDb()
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.publicId, code))
  if (!user) throw createError({ statusCode: 404, message: 'Такого читателя нет' })

  // Левое присоединение: закладка на снятую с сайта главу тоже остаётся в списке,
  // просто без названия.
  const rows = await db
    .select({
      chapterId: readingProgress.chapterId,
      title: chapters.title,
      isRead: readingProgress.isRead,
      scroll: readingProgress.scroll,
      updatedAt: readingProgress.updatedAt,
    })
    .from(readingProgress)
    .leftJoin(chapters, eq(chapters.id, readingProgress.chapterId))
    .where(eq(readingProgress.userId, user.id))
    .orderBy(desc(readingProgress.updatedAt))

  return {
    readCount: rows.filter(r => r.isRead).length,
    openedCount: rows.length,
    lastRead: rows[0] ? { id: rows[0].chapterId, title: rows[0].title, at: rows[0].updatedAt } : null,
    chapters: rows.map(r => ({
      id: r.chapterId,
      title: r.title,
      isRead: r.isRead,
      // Доля прокрутки в процентах — так читать проще, чем 0.4375.
      scrollPercent: Math.round(r.scroll * 100),
      updatedAt: r.updatedAt,
    })),
  }
})
