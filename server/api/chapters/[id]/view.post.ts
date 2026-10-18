import { createHash } from 'node:crypto'
import { useDb } from '../../../utils/db'
import { chapters, chapterStats, chapterViewDays, readerDays } from '../../../database/schema'
import { eq, sql } from 'drizzle-orm'

/** Код браузера: случайная строка из localStorage. Всё иное — не он. */
const VISITOR_RE = /^[\w-]{8,64}$/

/**
 * Отпечаток браузера на сегодня. Дата в отпечатке — чтобы вчерашнего и
 * сегодняшнего читателя нельзя было сопоставить; секрет — чтобы по известному
 * коду нельзя было найти его строку.
 */
function visitorOfDay(visitor: string, day: string) {
  const secret = useRuntimeConfig().sessionPassword || ''
  return createHash('sha256').update(`${day}:${visitor}:${secret}`).digest('hex').slice(0, 16)
}

/**
 * Просмотр главы. Его дёргает уже загруженная страница, а не серверный рендер:
 * скрапер, который просто скачал HTML и не выполняет JS, сюда не приходит.
 * Плюс отсев ботов по user-agent. Повторные заходы одного читателя считаются
 * заново — дедупликации по адресу нет, адреса мы не храним.
 *
 * Отдельно считаются разные читатели за день (reader_days): страница шлёт
 * случайный код своего браузера, а в базу ложится только его отпечаток.
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

  const day = mskDay()
  const body = await readBody<{ visitor?: unknown } | undefined>(event).catch(() => undefined)
  const visitor = typeof body?.visitor === 'string' && VISITOR_RE.test(body.visitor) ? body.visitor : null

  // Все записи одной транзакцией: порознь это несколько сбросов на диск вместо одного.
  const viewDay = db
    .insert(chapterViewDays)
    .values({ chapterId: id, day, count: 1 })
    .onConflictDoUpdate({
      target: [chapterViewDays.chapterId, chapterViewDays.day],
      set: { count: sql`count + 1` },
    })
  const viewTotal = db
    .insert(chapterStats)
    .values({ chapterId: id, viewsCount: 1, downloadsCount: 0 })
    .onConflictDoUpdate({
      target: chapterStats.chapterId,
      set: { viewsCount: sql`views_count + 1` },
    })

  if (visitor) {
    // Тот же браузер за тот же день — строка уже есть, и второй раз он не считается.
    const reader = db.insert(readerDays).values({ day, visitor: visitorOfDay(visitor, day) }).onConflictDoNothing()
    await db.batch([viewDay, viewTotal, reader])
  }
  else {
    await db.batch([viewDay, viewTotal])
  }

  return { ok: true, counted: true }
})
