import type { H3Event } from 'h3'

/**
 * Адрес, по которому сайт открыт у человека. Обычно это Host запроса, но
 * зеркало inn.taverna-book.ru стоит за CDN, который ходит к Railway с его
 * служебным именем в Host — иначе Railway не поймёт, куда слать. Сам домен
 * при этом едет в X-Forwarded-Host. Верить этому заголовку можно только для
 * известных зеркал: прислать его может кто угодно, и без списка вход через
 * Google просился бы вернуть человека на чужой адрес.
 *
 * Список зеркал — MIRROR_HOSTS через запятую; по умолчанию одно .ru-зеркало.
 */
const DEFAULT_MIRRORS = 'inn.taverna-book.ru'

export function mirrorHosts(): string[] {
  return (process.env.MIRROR_HOSTS ?? DEFAULT_MIRRORS)
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean)
}

export function publicOrigin(event: H3Event): string {
  const seen = getRequestURL(event)
  const forwarded = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })

  if (forwarded.hostname !== seen.hostname && mirrorHosts().includes(forwarded.hostname)) {
    return forwarded.origin
  }
  return seen.origin
}
