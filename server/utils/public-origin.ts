import type { H3Event } from "h3";

/**
 * Второй адрес сайта — taverna-book.ru, свой домен в Railway рядом с основным
 * taverna-book.com. Google пускает с обоих (оба адреса возврата прописаны в его
 * консоли), а телеграм-боту выдан один домен — основной. Поэтому вход через
 * телеграм с зеркала идёт через основной домен и возвращается на зеркало
 * одноразовым билетом (utils/handoff.ts).
 *
 * Список заодно белый: на хост не из него билет не уедет.
 */
export const MIRROR_HOSTS = ["taverna-book.ru"];

/** Адрес, по которому сайт открыт у человека. */
export function publicOrigin(event: H3Event): string {
  return getRequestURL(event).origin;
}

/** Хост зеркала, если сайт открыт через него, иначе null. */
export function viaMirror(event: H3Event): string | null {
  const host = getRequestURL(event).hostname.toLowerCase();
  return MIRROR_HOSTS.includes(host) ? host : null;
}
