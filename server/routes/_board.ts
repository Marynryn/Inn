import type { BoardClientMessage } from '#shared/utils/board'
import { isBoardCode } from '#shared/utils/board'
import { boardUser } from '../utils/board-access'
import { dropPeer, joinRoom, leaveRoom, playSkill, postChat, rollDice, startGame } from '../utils/board-rooms'
import { claimTicket } from '../utils/notify-tickets'

/**
 * Сокет настольной игры. Кто это, сокет не знает — как и у уведомлений,
 * человек предъявляет одноразовый билет вместе с кодом комнаты. Кубик
 * бросает сервер: браузер только просит бросить.
 */
export default defineWebSocketHandler({
  async message(peer, message) {
    let msg: BoardClientMessage
    try { msg = JSON.parse(message.text()) }
    catch { return }
    if (!msg || typeof msg !== 'object') return

    switch (msg.type) {
      case 'join': {
        const user = await boardUser(claimTicket(msg.ticket))
        const error = !user
          ? 'Чтобы играть, нужно войти'
          : !isBoardCode(msg.code) ? 'Такой комнаты нет' : joinRoom(msg.code, user, peer)
        if (error) {
          try { peer.send(JSON.stringify({ type: 'error', message: error, fatal: true })) } catch {}
        }
        return
      }
      case 'start': return startGame(peer)
      case 'roll': return rollDice(peer)
      case 'skill': return playSkill(peer, msg.skill, msg.target)
      case 'chat': return postChat(peer, msg.text)
      case 'leave': return leaveRoom(peer)
    }
  },

  close(peer) {
    dropPeer(peer)
  },

  error(peer) {
    dropPeer(peer)
  },
})
