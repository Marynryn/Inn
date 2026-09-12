import { inArray } from 'drizzle-orm'
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
/** Слова каждой главы оригинала по порядку, JSON-массив. В /api/settings не отдаётся — велик. */
export const ORIGINAL_WORDS_KEY = 'original_chapter_words'

const STALE_MS = 24 * 60 * 60 * 1000

type InnWords = { chapters?: { chapter_name: string; wordcount?: number }[] }

export async function refreshOriginalChapters() {
  const data = await $fetch<InnWords>(INNWORDS_URL, { timeout: 20_000 })
  const count = data.chapters?.length ?? 0
  if (!count) throw new Error('InnWords вернул пустой список глав')

  // Слова — по главам, а не одним итогом: трекеру нужно «сколько слов в первых
  // N главах», чтобы сравнивать переведённое и прочитанное с книгой в её же
  // единицах. Порядок — порядок оригинала; перевод идёт в том же.
  const words = data.chapters!.map(c => Math.max(0, Math.round(c.wordcount ?? 0)))

  const db = useDb()
  const rows: [string, string][] = [
    [ORIGINAL_AUTO_KEY, String(count)],
    [ORIGINAL_WORDS_KEY, JSON.stringify(words)],
    [ORIGINAL_AT_KEY, new Date().toISOString()],
  ]
  for (const [key, value] of rows) {
    await db
      .insert(siteSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value } })
  }
  return count
}

/**
 * Обновить, если данных ещё нет или им больше суток. Ошибку сети только логируем.
 * Слова проверяем отдельно: сервер, который узнал число глав до того, как мы
 * стали запоминать слова, иначе ждал бы их до следующего будильника.
 */
export async function refreshOriginalChaptersIfStale() {
  const db = useDb()
  const rows = await db.select().from(siteSettings).where(inArray(siteSettings.key, [ORIGINAL_AT_KEY, ORIGINAL_WORDS_KEY]))
  const atRow = rows.find(r => r.key === ORIGINAL_AT_KEY)
  const hasWords = rows.some(r => r.key === ORIGINAL_WORDS_KEY && r.value.length > 2)
  const at = atRow ? new Date(atRow.value).getTime() : 0
  if (hasWords && at && Date.now() - at < STALE_MS) return

  try {
    const count = await refreshOriginalChapters()
    console.log(`[original] глав в оригинале: ${count}`)
  } catch (e: any) {
    console.warn(`[original] не удалось узнать число глав оригинала: ${e?.message ?? e}`)
  }
}
