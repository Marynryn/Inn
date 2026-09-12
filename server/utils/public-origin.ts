import type { H3Event } from 'h3'

/**
 * Адрес, по которому сайт открыт у человека. Обычно это Host запроса, но
 * зеркало inn.taverna-book.ru стоит за CDN, который ходит к Railway с его
 * служебным именем в Host — иначе Railway не поймёт, куда слать. Кто открыл
 * сайт по служебному имени, тому и вход через Google возвращал бы человека на
 * него, где кука сессии никому не нужна.
 *
 * Настоящий домен узнаём двумя способами. Первый — X-Forwarded-Host, если
 * прокси его передаёт; верим ему только для известных зеркал, иначе прислать
 * его мог бы кто угодно. Второй, на случай, когда прокси заголовок не шлёт
 * (CDN Beget не шлёт): запрос пришёл на служебное имя Railway, а зеркало в
 * списке одно — значит, мы на нём. Основной домен сюда не попадает: у него
 * свой Host, Railway его знает.
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

/** Служебное имя сервиса на Railway: то, что стоит в Host у запросов от CDN. */
export function isInternalHost(hostname: string): boolean {
  const own = process.env.RAILWAY_PUBLIC_DOMAIN?.toLowerCase()
  return hostname === own || /\.up\.railway\.app$/i.test(hostname)
}

export function publicOrigin(event: H3Event): string {
  const seen = getRequestURL(event)
  const forwarded = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
  const mirrors = mirrorHosts()

  if (forwarded.hostname !== seen.hostname && mirrors.includes(forwarded.hostname)) {
    return forwarded.origin
  }

  if (isInternalHost(seen.hostname) && mirrors.length === 1) {
    return `https://${mirrors[0]}`
  }

  return seen.origin
}
