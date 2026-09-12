import { randomBytes } from 'node:crypto'

/*
  Передача входа с основного домена на зеркало. CDN перед зеркалом отдаёт 403 на
  любой запрос, где в параметре стоит подряд 16+ букв и цифр, — а код, который
  Google присылает на возврате, как раз такой. Поэтому Google возвращает человека
  на основной домен, там вход завершается, а на зеркало браузер уезжает с
  коротким одноразовым билетом: 12 символов проходят под фильтр, а 71 бит
  случайности, минута жизни и одно применение не дают его подобрать.

  Хранилище в памяти: сервер один, и билет нужен на секунды.
*/
const TTL_MS = 60_000
const TICKET_LENGTH = 12
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export type Handoff = { userId: number; created: boolean }

const tickets = new Map<string, Handoff & { expires: number }>()

function sweep(now: number) {
  for (const [key, value] of tickets) if (value.expires <= now) tickets.delete(key)
}

export function issueTicket(handoff: Handoff, now = Date.now()): string {
  sweep(now)
  const bytes = randomBytes(TICKET_LENGTH)
  let ticket = ''
  for (const b of bytes) ticket += ALPHABET[b % ALPHABET.length]
  tickets.set(ticket, { ...handoff, expires: now + TTL_MS })
  return ticket
}

/** Забрать билет. Второй раз, просроченный или выдуманный — null. */
export function takeTicket(ticket: unknown, now = Date.now()): Handoff | null {
  sweep(now)
  if (typeof ticket !== 'string') return null
  const found = tickets.get(ticket)
  if (!found) return null
  tickets.delete(ticket)
  return { userId: found.userId, created: found.created }
}

/** Куда Google не должен возвращать — там, где стоит фильтр. Из state узнаём зеркало. */
export const MIRROR_STATE_PREFIX = 'mirror='

export function mirrorFromState(state: unknown, allowed: string[]): string | null {
  if (typeof state !== 'string' || !state.startsWith(MIRROR_STATE_PREFIX)) return null
  const host = state.slice(MIRROR_STATE_PREFIX.length).toLowerCase()
  return allowed.includes(host) ? host : null
}
