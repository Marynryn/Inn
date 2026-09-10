export const wsRooms = new Map<string, Set<any>>()

/**
 * Личные комнаты для уведомлений — отдельной картой, а не ключом в wsRooms.
 * Так номер читателя нельзя спутать с названием главы, каким бы оно ни было.
 */
export const wsUsers = new Map<number, Set<any>>()

export function wsBroadcast(chapterId: string | null, data: unknown) {
  const key = chapterId ?? 'site'
  const room = wsRooms.get(key)
  if (!room?.size) return
  const msg = JSON.stringify(data)
  for (const peer of room) {
    try { peer.send(msg) } catch { room.delete(peer) }
  }
}

/** Толчок в личную комнату: у читателя может быть открыто несколько вкладок. */
export function wsToUser(userId: number, data: unknown) {
  const room = wsUsers.get(userId)
  if (!room?.size) return
  const msg = JSON.stringify(data)
  for (const peer of room) {
    try { peer.send(msg) } catch { room.delete(peer) }
  }
}

/** Убирает соединение изо всех комнат и подчищает опустевшие. */
export function wsForget(peer: any) {
  for (const [key, room] of wsRooms) {
    room.delete(peer)
    if (!room.size) wsRooms.delete(key)
  }
  for (const [key, room] of wsUsers) {
    room.delete(peer)
    if (!room.size) wsUsers.delete(key)
  }
}
