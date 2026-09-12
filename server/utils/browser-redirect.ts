import type { H3Event } from 'h3'
import { isInternalHost } from './public-origin'

/**
 * Переадресация, которую выполнит браузер, а не прокси. CDN перед зеркалом
 * проходит по редиректам сервера сам: получив 302 на accounts.google.com, он
 * приносит страницу Google под нашим адресом, где её скрипты не работают, а
 * куку сессии из промежуточного ответа теряет. Поэтому за CDN отдаём не 302,
 * а обычную страницу с мгновенным переходом — её прокси трогать не станет.
 * На основном домене (и везде, где Host свой) — честный 302, как и было.
 */
export function sendBrowserRedirect(event: H3Event, url: string) {
  if (!isInternalHost(getRequestURL(event).hostname)) return sendRedirect(event, url)

  const safe = url.replace(/"/g, '&quot;').replace(/</g, '&lt;')
  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${safe}">
<title>Переход…</title></head>
<body><script>location.replace(${JSON.stringify(url)})</script>
<p>Переходим… <a href="${safe}">Нажмите, если ничего не произошло.</a></p></body></html>`
}
