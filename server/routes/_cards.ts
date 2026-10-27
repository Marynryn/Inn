import type { CardsClientMessage } from '#shared/utils/cards'
import { isCardsCode } from '#shared/utils/cards'
import { claimBoardTicket } from '../utils/board-access'
import { cardsAct, cardsRematch, chooseCardsTeam, dropCardsPeer, joinCardsRoom, leaveCardsRoom } from '../utils/cards-rooms'

/**
 * Сокет «Карт таверны». Как у настольной игры: человек предъявляет
 * одноразовый билет из /api/board/ticket и код стола, дальше шлёт ходы.
 */
export default defineWebSocketHandler({
  message(peer, message) {
    let msg: CardsClientMessage
    try { msg = JSON.parse(message.text()) }
    catch { return }
    if (!msg || typeof msg !== 'object') return

    switch (msg.type) {
      case 'join': {
        const user = claimBoardTicket(msg.ticket)
        const error = !user
          ? 'Не вышло сесть за стол — обнови страницу'
          : !isCardsCode(msg.code) ? 'Такого стола нет' : joinCardsRoom(msg.code, user, peer)
        if (error) {
          try { peer.send(JSON.stringify({ type: 'error', message: error, fatal: true })) } catch {}
        }
        return
      }
      case 'team': return chooseCardsTeam(peer, msg.team)
      case 'act': return cardsAct(peer, msg.action)
      case 'rematch': return cardsRematch(peer)
      case 'leave': return leaveCardsRoom(peer)
    }
  },

  close(peer) {
    dropCardsPeer(peer)
  },

  error(peer) {
    dropCardsPeer(peer)
  },
})
