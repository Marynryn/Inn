import { createHash, randomBytes } from "node:crypto";
import {
  NUXT_IMG_ONERROR,
  READER_BOOT,
  claritySnippet,
} from "#shared/utils/inlineScripts";

/**
 * Политика безопасности содержимого для страниц сайта (server/plugins/csp.ts).
 *
 * Скрипты — только свои файлы (/_nuxt) и встроенные с nonce, который сервер
 * раздаёт каждой странице заново. Внедрённый в страницу чужой <script> (через
 * дыру в разметке, расширение, перехваченный ответ) без nonce не выполнится.
 * Встроенные скрипты, которые Nuxt вставляет и при переходах внутри сайта,
 * пропускаются по хэшу содержимого — nonce у них нет.
 *
 * Что сайт берёт снаружи и зачем:
 *  - Microsoft Clarity (скрипт, отправка записей) — только если задан ID;
 *  - cdn.jsdelivr.net — список смайлов для emoji-picker-element.
 * Стили — 'unsafe-inline': Vue ставит style="…" на элементы, текст глав несёт
 * свои цвета. Картинки — свои, data: и blob: (превью загружаемой аватарки).
 */

const CLARITY_HOSTS = [
  "https://www.clarity.ms",
  "https://*.clarity.ms",
  "https://c.bing.com",
];

const sha256 = (text: string) =>
  `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

export const newNonce = () => randomBytes(16).toString("base64");

export function contentSecurityPolicy(opts: {
  nonce: string;
  clarityId?: string;
}): string {
  const clarity = opts.clarityId ? CLARITY_HOSTS : [];
  const inlineHashes = [
    sha256(READER_BOOT),
    ...(opts.clarityId ? [sha256(claritySnippet(opts.clarityId))] : []),
  ];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${opts.nonce}'`,
      ...inlineHashes,
      // Атрибуты-обработчики пропускаются только с 'unsafe-hashes' и только
      // этот один, по хэшу: onerror у картинок Nuxt Image.
      "'unsafe-hashes'",
      sha256(NUXT_IMG_ONERROR),
      ...clarity,
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...clarity],
    "font-src": ["'self'", "data:"],
    // wss: — свои сокеты (/_ws, /_board, /_cards); 'self' их покрывает не во
    // всех браузерах.
    "connect-src": ["'self'", "wss:", "https://cdn.jsdelivr.net", ...clarity],
    "frame-ancestors": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "report-uri": ["/api/csp-report"],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** Ставит nonce каждому <script> в кусках HTML, у которого его ещё нет. */
export function addNonce(parts: string[], nonce: string): string[] {
  return parts.map((part) =>
    part.replace(/<script\b(?![^>]*\snonce=)/gi, `<script nonce="${nonce}"`),
  );
}
