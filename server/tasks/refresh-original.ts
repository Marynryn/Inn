import { refreshOriginalChapters } from '../utils/original-toc'
import { isDemo } from '../utils/demo/seed'

/** Раз в сутки узнаёт у InnWords, сколько глав в оригинале, — для трекера прогресса. */
export default defineTask({
  meta: {
    name: 'refresh-original',
    description: 'Обновляет число глав оригинала из InnWords',
  },
  async run() {
    // У выдуманной книги демо-стенда оригинала нет — считать нечего.
    if (isDemo()) return { result: 'demo' }
    try {
      return { result: { count: await refreshOriginalChapters() } }
    } catch (e: any) {
      console.warn(`[original] не удалось обновить число глав оригинала: ${e?.message ?? e}`)
      return { result: { error: String(e?.message ?? e) } }
    }
  },
})
