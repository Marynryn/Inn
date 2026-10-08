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
  const same = rows.find(r => slugifyChapterId(r.id) === target)
  if (same) return same.id

  // Главу перезалили с буквой на конце («1.35» → «1.35 R»), и старый адрес,
  // который уже в поиске, стал 404. Отдаём главу с тем же номером и одной
  // буквенной припиской — страница затем уводит 301-м на новый адрес. Только
  // если такая глава одна: из двух («4.06 KM» и «4.06 R») угадывать нельзя.
  const renamed = rows.filter((r) => {
    const slug = slugifyChapterId(r.id)
    return slug.startsWith(`${target}-`) && /^[a-z]+$/.test(slug.slice(target.length + 1))
  })
  return renamed.length === 1 ? renamed[0].id : null
}
