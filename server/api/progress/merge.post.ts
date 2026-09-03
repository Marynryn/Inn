import { sql } from 'drizzle-orm'
import { readingProgress } from '../../database/schema'
import { useDb } from '../../utils/db'

/**
 * Переносит закладку из браузера на сервер — один раз, при первом входе. До
 * появления аккаунтов всё читалось гостем, и терять эту историю нельзя.
 *
 * Сливаем, а не заменяем: прочитанные главы объединяются, прокрутка берётся
 * большая из двух. Человек мог читать и там, и там.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = (session.user as { id?: number } | undefined)?.id
  if (!userId) return { ok: false }

  const body = await readBody(event)
  const read: string[] = Array.isArray(body?.read) ? body.read.map(String) : []
  const scroll: Record<string, number> = body?.scroll && typeof body.scroll === 'object' ? body.scroll : {}
  const lastReadId = body?.lastReadId ? String(body.lastReadId) : null

  const ids = [...new Set([...read, ...Object.keys(scroll)])].slice(0, 500)
  if (!ids.length) return { ok: true, merged: 0 }

  const db = useDb()
  for (const chapterId of ids) {
    const value = Number(scroll[chapterId])
    const safeScroll = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0

    await db
      .insert(readingProgress)
      .values({ userId, chapterId, isRead: read.includes(chapterId), scroll: safeScroll })
      .onConflictDoUpdate({
        target: [readingProgress.userId, readingProgress.chapterId],
        set: {
          isRead: sql`is_read OR ${read.includes(chapterId) ? 1 : 0}`,
          scroll: sql`max(scroll, ${safeScroll})`,
        },
      })
  }

  // Закладку двигаем последней: последняя глава определяется по времени
  // обновления строки, и она должна оказаться свежее всех перенесённых.
  if (lastReadId && ids.includes(lastReadId)) {
    await db
      .insert(readingProgress)
      .values({ userId, chapterId: lastReadId })
      .onConflictDoUpdate({
        target: [readingProgress.userId, readingProgress.chapterId],
        set: { updatedAt: sql`(datetime('now'))` },
      })
  }

  return { ok: true, merged: ids.length }
})
