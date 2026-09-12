import { eq } from 'drizzle-orm'
import { useDb } from './db'
import { siteSettings } from '../database/schema'

/*
  Сколько глав в оригинале — чтобы трекер показывал не только «догнали
  перевод», но и «сколько всей книги позади». Число берём из InnWords —
  фанатской базы, которая считает слова в каждой главе wanderinginn.com:
  сам сайт оригинала за Cloudflare и серверу не отвечает. Слова оттуда
  не используем: наши русские слова с их английскими не складываются.

  Пишем число в настройки: страница читает его из базы, а не ходит наружу
  на каждый показ. Раз в сутки обновляем; руками админ может перекрыть
  своим числом — тогда автоматическое просто лежит рядом.
*/
const INNWORDS_URL = 'https://innwords.pallandor.com/components/wordcount?min_chapter=1.00&max_chapter=Latest&format=json'

export const ORIGINAL_AUTO_KEY = 'original_chapters_auto'
export const ORIGINAL_AT_KEY = 'original_chapters_auto_at'
export const ORIGINAL_MANUAL_KEY = 'original_chapters_total'

const STALE_MS = 24 * 60 * 60 * 1000

type InnWords = { chapters?: { chapter_name: string }[] }

export async function refreshOriginalChapters() {
  const data = await $fetch<InnWords>(INNWORDS_URL, { timeout: 20_000 })
  const count = data.chapters?.length ?? 0
  if (!count) throw new Error('InnWords вернул пустой список глав')

  const db = useDb()
  for (const [key, value] of [[ORIGINAL_AUTO_KEY, String(count)], [ORIGINAL_AT_KEY, new Date().toISOString()]]) {
    await db
      .insert(siteSettings)
      .values({ key: key!, value: value! })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: value! } })
  }
  return count
}

/** Обновить, если числа ещё нет или ему больше суток. Ошибку сети только логируем. */
export async function refreshOriginalChaptersIfStale() {
  const db = useDb()
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, ORIGINAL_AT_KEY))
  const at = row ? new Date(row.value).getTime() : 0
  if (at && Date.now() - at < STALE_MS) return

  try {
    const count = await refreshOriginalChapters()
    console.log(`[original] глав в оригинале: ${count}`)
  } catch (e: any) {
    console.warn(`[original] не удалось узнать число глав оригинала: ${e?.message ?? e}`)
  }
}
