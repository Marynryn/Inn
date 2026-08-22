import { useDb } from '../../utils/db'
import { chapters, siteSettings } from '../../database/schema'
import { and, eq, inArray, isNull } from 'drizzle-orm'
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

  // Берём главы по факту публикации, а не по дате загрузки: черновик мог пролежать
  // в базе неделями, и уведомить о нём нужно тогда, когда его открыли читателям.
  const published = await db
    .select({ id: chapters.id, title: chapters.title })
    .from(chapters)
    .where(and(eq(chapters.isPublished, true), isNull(chapters.notifiedAt)))

  if (published.length === 0) return { ok: true, notified: false }

  const byNumber = [...published].sort((a, b) => {
    const [av, ac] = a.id.split('.').map(Number)
    const [bv, bc] = b.id.split('.').map(Number)
    return av - bv || ac - bc
  })

  const siteUrl = config.public.siteUrl

  let message: string
  if (byNumber.length === 1) {
    message = `Добавлена новая глава — ${byNumber[0].id} «${byNumber[0].title}»\n${siteUrl}`
  } else {
    const volumes = new Map<number, typeof byNumber>()
    for (const ch of byNumber) {
      const vol = Number(ch.id.split('.')[0])
      if (!volumes.has(vol)) volumes.set(vol, [])
      volumes.get(vol)!.push(ch)
    }

    const ranges = [...volumes.values()].map((group) => {
      const first = group[0].id
      const last = group[group.length - 1].id
      return first === last ? first : `${first}-${last}`
    })

    const joined = ranges.length > 1
      ? `${ranges.slice(0, -1).join(', ')} и ${ranges[ranges.length - 1]}`
      : ranges[0]

    message = `Добавлены новые главы: ${joined}\n${siteUrl}`
  }

  await sendTelegramMessage(message)

  const now = new Date().toISOString()
  await db
    .update(chapters)
    .set({ notifiedAt: now })
    .where(inArray(chapters.id, byNumber.map(c => c.id)))

  await db
    .insert(siteSettings)
    .values({ key: LAST_NOTIFY_KEY, value: now })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: now } })

  return { ok: true, notified: true, count: published.length }
})
