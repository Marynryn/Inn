export const wsRooms = new Map<string, Set<any>>()

export function wsBroadcast(chapterId: string | null, data: unknown) {
  const key = chapterId ?? 'site'
  const room = wsRooms.get(key)
  if (!room?.size) return
  const msg = JSON.stringify(data)
  for (const peer of room) {
    try { peer.send(msg) } catch { room.delete(peer) }
  }
}
