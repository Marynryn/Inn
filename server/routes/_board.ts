import type { BoardClientMessage } from '#shared/utils/board'
import { isBoardCode } from '#shared/utils/board'
import { claimBoardTicket } from '../utils/board-access'
import { chooseDice, dropPeer, joinRoom, leaveRoom, playSkill, postChat, rematch, rollDice, startGame } from '../utils/board-rooms'

/**
 * Сокет настольной игры. Кто это, сокет не знает: человек предъявляет
 * одноразовый билет из /api/board/ticket вместе с кодом комнаты. Кубик
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
        const user = claimBoardTicket(msg.ticket)
        const error = !user
          ? 'Не вышло сесть за стол — обнови страницу'
          : !isBoardCode(msg.code) ? 'Такого стола нет' : joinRoom(msg.code, user, peer)
        if (error) {
          try { peer.send(JSON.stringify({ type: 'error', message: error, fatal: true })) } catch {}
        }
        return
      }
      case 'start': return startGame(peer)
      case 'roll': return rollDice(peer)
      case 'choose': return chooseDice(peer, msg.index)
      case 'skill': return playSkill(peer, msg.skill, msg.target)
      case 'chat': return postChat(peer, msg.text)
      case 'leave': return leaveRoom(peer)
      case 'rematch': return rematch(peer)
    }
  },

  close(peer) {
    dropPeer(peer)
  },

  error(peer) {
    dropPeer(peer)
  },
})
