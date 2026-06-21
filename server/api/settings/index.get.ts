import { useDb } from '../../utils/db'
import { siteSettings } from '../../database/schema'

export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db.select().from(siteSettings)
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
})
