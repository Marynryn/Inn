import { slugifyChapterId } from '../../shared/utils/slug'

/*
  IndexNow — сайт сам сообщает поисковику, что открылась новая страница, и
  робот приходит за ней за часы, а не когда дойдёт по sitemap. Протокол
  понимают Яндекс, Bing, Seznam и другие; Google — нет. Шлём в Яндекс: ради
  него это и заведено, а принятые адреса он передаёт остальным участникам.

  Ключ — не секрет. Поисковик проверяет, что в корне сайта лежит файл
  /<ключ>.txt с этой же строкой (public/698970b9….txt), и так убеждается, что
  адреса шлёт хозяин. Меняя ключ, переименуй и файл.
*/
export const INDEXNOW_KEY = '698970b9203d11d57f7b89aed571a1cc'

const ENDPOINT = 'https://yandex.com/indexnow'

export interface IndexNowRequest {
  host: string
  key: string
  keyLocation: string
  urlList: string[]
}

/**
 * Тело запроса — или null, если слать некуда. Dev и тесты поднимают сайт на
 * http://localhost: до ключа на нём поисковик не достучится, а адреса глав
 * были бы чужими для боевого сайта.
 */
export function indexNowRequest(siteUrl: string, chapterIds: string[]): IndexNowRequest | null {
  let site: URL
  try {
    site = new URL(siteUrl)
  } catch {
    return null
  }
  if (site.protocol !== 'https:') return null
  if (['localhost', '127.0.0.1', '[::1]'].includes(site.hostname)) return null
  if (chapterIds.length === 0) return null

  return {
    host: site.host,
    key: INDEXNOW_KEY,
    keyLocation: `${site.origin}/${INDEXNOW_KEY}.txt`,
    // Тот же адрес, что в sitemap.xml и canonical, — по нему глава и проиндексируется.
    urlList: chapterIds.map(id => `${site.origin}/chapter/${encodeURIComponent(slugifyChapterId(id))}`),
  }
}

/**
 * Сообщает Яндексу об открытых читателям главах. Вызывается без await и сам
 * ничего не бросает: публикация не должна ждать поисковик или падать из-за
 * него — в худшем случае робот придёт по sitemap, как раньше. Итог пишется в
 * лог, чтобы его было видно в логах Railway.
 */
export async function pingIndexNow(chapterIds: string[]): Promise<void> {
  const config = useRuntimeConfig()
  // Демо-стенд закрыт от поиска — звать робота на него незачем.
  if (config.public.demo) return
  const body = indexNowRequest(config.public.siteUrl, chapterIds)
  if (!body) return

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 200) {
      console.log(`[indexnow] Яндекс принял: ${body.urlList.join(', ')}`)
    } else if (res.status === 202) {
      // Так Яндекс отвечает, пока впервые проверяет ключ: адреса стоит прислать снова позже.
      console.warn(`[indexnow] ключ ещё проверяется (202): ${body.urlList.join(', ')}`)
    } else {
      const text = (await res.text().catch(() => '')).slice(0, 300)
      console.warn(`[indexnow] Яндекс ответил ${res.status}: ${text}`)
    }
  } catch (err) {
    console.warn(`[indexnow] не удалось отправить ${body.urlList.join(', ')}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
