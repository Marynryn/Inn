import { randomUUID } from 'node:crypto'

/**
 * Одноразовые билеты для подписки на свои уведомления по WebSocket.
 *
 * Комнату нельзя брать из адреса соединения, как это сделано для глав: главы
 * открыты всем, а уведомления — нет, и `?userId=29` дал бы кому угодно читать
 * чужие ответы. Поэтому читатель сначала просит билет обычным запросом — там
 * есть кука и сервер точно знает, кто спрашивает, — а потом предъявляет билет
 * по сокету.
 *
 * Билет живёт минуту и сгорает при первом предъявлении: перехватить его можно
 * только вместе с самой сессией, а тогда воровать билет уже незачем.
 */

type Ticket = { userId: number, expiresAt: number }

const tickets = new Map<string, Ticket>()

/** Минуты хватает: билет берут и предъявляют в двух соседних действиях. */
const TTL_MS = 60_000

/** Подчищаем просроченные на каждом обращении — отдельный таймер тут не нужен. */
function sweep() {
  const now = Date.now()
  for (const [key, t] of tickets) {
    if (t.expiresAt <= now) tickets.delete(key)
  }
}

export function issueTicket(userId: number): string {
  sweep()
  const ticket = randomUUID()
  tickets.set(ticket, { userId, expiresAt: Date.now() + TTL_MS })
  return ticket
}

/** Возвращает владельца билета и гасит билет. Неизвестный или просроченный — null. */
export function claimTicket(ticket: unknown): number | null {
  sweep()

  if (typeof ticket !== 'string') return null

  const found = tickets.get(ticket)
  if (!found) return null

  tickets.delete(ticket)
  return found.userId
}
