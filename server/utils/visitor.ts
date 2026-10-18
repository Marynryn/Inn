import { createHash } from 'node:crypto'

/** Код браузера: случайная строка из localStorage (app/utils/visitorId). Всё иное — не он. */
const VISITOR_RE = /^[\w-]{8,64}$/

/** Код браузера из тела запроса или null, если его нет или он не похож на код. */
export async function readVisitor(event: Parameters<typeof readBody>[0]): Promise<string | null> {
  const body = await readBody<{ visitor?: unknown } | undefined>(event).catch(() => undefined)
  return typeof body?.visitor === 'string' && VISITOR_RE.test(body.visitor) ? body.visitor : null
}

/**
 * Отпечаток кода браузера вместо самого кода. `scope` — то, к чему он
 * привязан (день, барабан): отпечатки одного браузера в разных счётчиках не
 * совпадают и не сопоставляются. Секрет — чтобы по известному коду нельзя было
 * найти его строку.
 */
export function visitorPrint(visitor: string, scope: string) {
  const secret = useRuntimeConfig().sessionPassword || ''
  return createHash('sha256').update(`${scope}:${visitor}:${secret}`).digest('hex').slice(0, 16)
}
