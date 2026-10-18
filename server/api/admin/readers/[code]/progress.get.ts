import { desc, eq } from 'drizzle-orm'
import { chapters, readingProgress, users } from '../../../../database/schema'
import { useDb } from '../../../../utils/db'

/**
 * Последние главы, которые открывал читатель, — для админки.
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
  return db
    .select({
      id: readingProgress.chapterId,
      title: chapters.title,
      updatedAt: readingProgress.updatedAt,
    })
    .from(readingProgress)
    .leftJoin(chapters, eq(chapters.id, readingProgress.chapterId))
    .where(eq(readingProgress.userId, user.id))
    .orderBy(desc(readingProgress.updatedAt))
    .limit(5)
})
