import { sessionBoardUser } from '../../utils/board-access'
import { openRooms, roomOfUser } from '../../utils/board-rooms'
import { openCardsRooms } from '../../utils/cards-rooms'

/** Открытые столы — видно и гостям: за чужой стол они садятся, назвавшись.
 *  У вошедшего ещё и его незаконченная партия, чтобы вернуться. Столы обеих
 *  игр одним списком: game говорит, куда вести. */
export default defineEventHandler(async (event) => {
  const user = await sessionBoardUser(event)
  const rooms = [
    ...openRooms().map(r => ({ ...r, game: 'board' as const })),
    ...openCardsRooms().map(r => ({ ...r, game: 'cards' as const })),
  ]
  return { rooms, mine: user ? roomOfUser(user.id) : null, canCreate: Boolean(user) }
})
