import { useDb } from '../../utils/db'
import { siteSettings } from '../../database/schema'

const ALLOWED_KEYS = [
  'hero_title', 'hero_subtitle', 'ledger_note', 'footer_text',
  'telegram_url', 'boosty_url', 'tribute_url',
  'about_title', 'about_text',
  'error_404_sub', 'update_schedule', 'game_max_volume',
  'tg_cta_title', 'tg_cta_text',
]

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user?.role !== 'admin') throw createError({ statusCode: 403 })

  const body = await readBody(event) as Record<string, string>
  const db = useDb()

  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      await db
        .insert(siteSettings)
        .values({ key, value: String(body[key]) })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value: String(body[key]) } })
    }
  }

  return { ok: true }
})
