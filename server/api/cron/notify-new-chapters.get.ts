import { useDb } from '../../utils/db'
import { chapters } from '../../database/schema'
import { gte } from 'drizzle-orm'
import { sendTelegramMessage } from '../../utils/telegram'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const { secret } = getQuery(event)
  if (!config.notifySecret || secret !== config.notifySecret) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  const db = useDb()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ')

  const newChapters = await db
    .select({ id: chapters.id, title: chapters.title, isPublished: chapters.isPublished })
    .from(chapters)
    .where(gte(chapters.createdAt, since))

  const published = newChapters.filter(c => c.isPublished)
  if (published.length === 0) return { ok: true, notified: false }

  const list = published.map(c => `• ${c.title} (${c.id})`).join('\n')
  await sendTelegramMessage(`Новые главы за последние сутки:\n${list}`)

  return { ok: true, notified: true, count: published.length }
})
