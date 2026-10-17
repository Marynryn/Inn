import { eq } from 'drizzle-orm'
import { siteSettings } from '../database/schema'
import { useDb } from './db'

/** Включено ли в админке оформление на Хеллоуин. */
export async function isHalloween(): Promise<boolean> {
  const [row] = await useDb()
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, 'season_theme'))
  return row?.value === 'halloween'
}
