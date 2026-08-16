import type { useDb } from './db'
import { chapters } from '../database/schema'
import { eq } from 'drizzle-orm'

/**
 * Resolves an incoming URL param to the chapter's actual stored id.
 * Tries an exact match first (covers the vast majority of ids, which are
 * already clean), then falls back to comparing normalized slugs so that
 * old-style ids with spaces/mixed case ("4.06 KM") still resolve when
 * requested via their new clean slug ("4-06-km") or any legacy variant.
 */
export async function resolveChapterId(db: ReturnType<typeof useDb>, param: string): Promise<string | null> {
  const [exact] = await db.select({ id: chapters.id }).from(chapters).where(eq(chapters.id, param))
  if (exact) return exact.id

  const target = slugifyChapterId(param)
  const rows = await db.select({ id: chapters.id }).from(chapters)
  return rows.find(r => slugifyChapterId(r.id) === target)?.id ?? null
}
