import { eq } from 'drizzle-orm'
import { siteSettings } from '../database/schema'
import { useDb } from './db'

/**
 * Спрятанные карточки: список id в настройках сайта одной строкой JSON.
 * Отдельная таблица ради десятка галочек — перебор, а настройки уже есть.
 */
const KEY = 'characters_hidden'

export async function hiddenCharacterIds(): Promise<Set<string>> {
  const [row] = await useDb().select().from(siteSettings).where(eq(siteSettings.key, KEY))
  try {
    const parsed = JSON.parse(row?.value || '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

export async function setCharacterHidden(id: string, hidden: boolean): Promise<Set<string>> {
  const ids = await hiddenCharacterIds()
  if (hidden) ids.add(id)
  else ids.delete(id)
  const value = JSON.stringify([...ids])
  await useDb()
    .insert(siteSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value } })
  return ids
}
