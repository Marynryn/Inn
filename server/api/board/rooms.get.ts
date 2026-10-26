import { sessionBoardUser } from '../../utils/board-access'
import { openRooms, roomOfUser } from '../../utils/board-rooms'

/** Открытые столы — видно и гостям: за чужой стол они садятся, назвавшись.
 *  У вошедшего ещё и его незаконченная партия, чтобы вернуться. */
export default defineEventHandler(async (event) => {
  const user = await sessionBoardUser(event)
  return { rooms: openRooms(), mine: user ? roomOfUser(user.id) : null, canCreate: Boolean(user) }
})
