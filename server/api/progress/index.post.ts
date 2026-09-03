import { sql } from 'drizzle-orm'
import { readingProgress } from '../../database/schema'
import { useDb } from '../../utils/db'

/**
 * Отметка о главе: дочитал и/или где остановился. Гостю молча отвечаем «ладно» —
 * его закладка живёт в браузере, и валить страницу ошибкой из-за этого незачем.
 *
 * Прочитанность назад не отыгрывается: строку обновляет и прокрутка, и дочитывание,
 * и было бы обидно потерять галочку оттого, что главу переоткрыли с начала.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = (session.user as { id?: number } | undefined)?.id
  if (!userId) return { ok: false }

  const body = await readBody(event)
  const chapterId = String(body?.chapterId ?? '').trim()
  if (!chapterId) throw createError({ statusCode: 400, message: 'Нужен chapterId' })

  const isRead = Boolean(body?.read)
  const scroll = Number(body?.scroll)
  const safeScroll = Number.isFinite(scroll) ? Math.min(Math.max(scroll, 0), 1) : 0

  const db = useDb()
  await db
    .insert(readingProgress)
    .values({ userId, chapterId, isRead, scroll: safeScroll })
    .onConflictDoUpdate({
      target: [readingProgress.userId, readingProgress.chapterId],
      set: {
        isRead: sql`is_read OR ${isRead ? 1 : 0}`,
        scroll: safeScroll > 0 ? safeScroll : sql`scroll`,
        updatedAt: sql`(datetime('now'))`,
      },
    })

  return { ok: true }
})
