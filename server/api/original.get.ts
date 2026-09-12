import { inArray } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { siteSettings } from '../database/schema'
import { ORIGINAL_AUTO_KEY, ORIGINAL_MANUAL_KEY, ORIGINAL_WORDS_KEY } from '../utils/original-toc'

/**
 * Оригинал для трекера прогресса: сколько в нём глав и сколько слов в каждой,
 * по порядку. Слова — из InnWords; число глав руками заданное перекрывает
 * автоматическое, как и в /api/settings. Пока ничего не узнали — нули.
 */
export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db.select().from(siteSettings)
    .where(inArray(siteSettings.key, [ORIGINAL_AUTO_KEY, ORIGINAL_MANUAL_KEY, ORIGINAL_WORDS_KEY]))
  const get = (key: string) => rows.find(r => r.key === key)?.value ?? ''

  let chapterWords: number[] = []
  try {
    const parsed = JSON.parse(get(ORIGINAL_WORDS_KEY) || '[]')
    if (Array.isArray(parsed)) chapterWords = parsed.map(n => (typeof n === 'number' && n > 0 ? n : 0))
  } catch {}

  const chapters = parseInt(get(ORIGINAL_MANUAL_KEY) || get(ORIGINAL_AUTO_KEY)) || 0

  return {
    chapters,
    words: chapterWords.reduce((sum, n) => sum + n, 0),
    chapterWords,
  }
})
