import { useDb } from '../../utils/db'
import { chapters, siteSettings } from '../../database/schema'
import { eq, gt } from 'drizzle-orm'
import { sendTelegramMessage } from '../../utils/telegram'

const LAST_NOTIFY_KEY = 'last_chapter_notify_at'
const MIN_INTERVAL_MS = 20 * 60 * 60 * 1000 // не чаще раза в ~сутки, даже если крон дёрнет чаще

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const { secret } = getQuery(event)
  if (!config.notifySecret || secret !== config.notifySecret) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  const db = useDb()
  const [lastNotify] = await db.select().from(siteSettings).where(eq(siteSettings.key, LAST_NOTIFY_KEY))
  const lastNotifyAt = lastNotify?.value ? new Date(lastNotify.value) : null

  if (lastNotifyAt && Date.now() - lastNotifyAt.getTime() < MIN_INTERVAL_MS) {
    return { ok: true, notified: false, reason: 'rate-limited' }
  }

  const since = lastNotifyAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000)
  const sinceStr = since.toISOString().slice(0, 19).replace('T', ' ')

  const newChapters = await db
    .select({ id: chapters.id, title: chapters.title, isPublished: chapters.isPublished })
    .from(chapters)
    .where(gt(chapters.createdAt, sinceStr))

  const published = newChapters.filter(c => c.isPublished)
  if (published.length === 0) return { ok: true, notified: false }

  const list = published.map(c => `• ${c.title} (${c.id})`).join('\n')
  await sendTelegramMessage(`Новые главы:\n${list}`)

  const now = new Date().toISOString()
  await db
    .insert(siteSettings)
    .values({ key: LAST_NOTIFY_KEY, value: now })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: now } })

  return { ok: true, notified: true, count: published.length }
})
