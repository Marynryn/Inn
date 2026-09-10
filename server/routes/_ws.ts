import { claimTicket } from '../utils/notify-tickets'
import { wsForget, wsRooms, wsUsers } from '../utils/ws-rooms'

/**
 * Один сокет на два дела: комнаты по главам для новых комментариев и личные
 * комнаты для уведомлений.
 *
 * Глава берётся прямо из адреса — она открыта всем. А личная комната по адресу
 * не выдаётся: читатель предъявляет одноразовый билет сообщением, и только по
 * нему сервер узнаёт, чья это комната.
 */
export default defineWebSocketHandler({
  open(peer) {
    const url = new URL(peer.request?.url ?? '/', 'http://x')

    // Значок уведомлений висит на всех страницах и в комнате главы ему делать
    // нечего: без этого он получал бы каждый чужой комментарий на сайте впустую.
    if (url.searchParams.get('notify') === '1') return

    const key = url.searchParams.get('chapterId') ?? 'site'
    if (!wsRooms.has(key)) wsRooms.set(key, new Set())
    wsRooms.get(key)!.add(peer)
  },

  message(peer, message) {
    let parsed: any
    try { parsed = JSON.parse(message.text()) }
    catch { return }

    if (!parsed || typeof parsed !== 'object') return

    // Единственное, что мы слушаем от браузера: предъявление билета. Ничего
    // другого сокет принять не может — состояние живёт на сервере.
    if ('subscribe' in parsed) {
      const userId = claimTicket(parsed.subscribe)
      if (!userId) {
        try { peer.send(JSON.stringify({ type: 'subscribe_failed' })) } catch {}
        return
      }

      if (!wsUsers.has(userId)) wsUsers.set(userId, new Set())
      wsUsers.get(userId)!.add(peer)

      try { peer.send(JSON.stringify({ type: 'subscribed' })) } catch {}
    }
  },

  close(peer) {
    wsForget(peer)
  },

  error(peer) {
    wsForget(peer)
  },
})
