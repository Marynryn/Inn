import { wsRooms } from '../utils/ws-rooms'

export default defineWebSocketHandler({
  open(peer) {
    const url = new URL(peer.request?.url ?? '/', 'http://x')
    const key = url.searchParams.get('chapterId') ?? 'site'
    if (!wsRooms.has(key)) wsRooms.set(key, new Set())
    wsRooms.get(key)!.add(peer)
  },

  close(peer) {
    for (const room of wsRooms.values()) room.delete(peer)
  },

  error(peer) {
    for (const room of wsRooms.values()) room.delete(peer)
  },
})
