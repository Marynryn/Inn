import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { useDb } from './db'
import { chapters, siteSettings } from '../database/schema'
import { sendTelegramMessage } from './telegram'

export const LAST_NOTIFY_KEY = 'last_chapter_notify_at'

export interface NotifyResult {
  notified: boolean
  count: number
  reason?: 'nothing-to-send' | 'telegram-not-configured'
  message?: string
  chapterIds?: string[]
}

export async function getLastNotifyAt(): Promise<string | null> {
  const db = useDb()
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, LAST_NOTIFY_KEY))
  return row?.value || null
}

/**
 * Главы по факту публикации, а не по дате загрузки: черновик мог пролежать
 * в базе неделями, и уведомить о нём нужно тогда, когда его открыли читателям.
 */
export async function getPendingChapters() {
  const db = useDb()
  return db
    .select({ id: chapters.id, title: chapters.title })
    .from(chapters)
    .where(and(eq(chapters.isPublished, true), isNull(chapters.notifiedAt)))
    .orderBy(asc(chapters.sortOrder))
}

/**
 * Отправляет уведомление и помечает главы оповещёнными.
 * Без chapterIds берёт все ещё не оповещённые опубликованные главы;
 * со списком — только те из них, что попали в список. Про уже разосланную главу
 * второй раз не напишет ни крон, ни кнопка в админке.
 */
export async function notifyChapters(opts: {
  chapterIds?: string[]
  touchLastNotify?: boolean
} = {}): Promise<NotifyResult> {
  const db = useDb()

  const pending = await getPendingChapters()
  const list = opts.chapterIds
    ? pending.filter(c => opts.chapterIds!.includes(c.id))
    : pending

  if (list.length === 0) return { notified: false, count: 0, reason: 'nothing-to-send' }

  const message = buildChapterNotification(list, useRuntimeConfig().public.siteUrl)
  const sent = await sendTelegramMessage(message)
  // Бот не настроен — сообщение никуда не ушло, и помечать главы отправленными нельзя.
  if (!sent) return { notified: false, count: 0, reason: 'telegram-not-configured' }

  const ids = sortChaptersForNotification(list).map(c => c.id)
  const now = new Date().toISOString()

  await db.update(chapters).set({ notifiedAt: now }).where(inArray(chapters.id, ids))

  if (opts.touchLastNotify) {
    await db
      .insert(siteSettings)
      .values({ key: LAST_NOTIFY_KEY, value: now })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: now } })
  }

  return { notified: true, count: ids.length, message, chapterIds: ids }
}
