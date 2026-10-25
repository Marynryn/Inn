import { requireBoardUser } from '../../utils/board-access'
import { openRooms, roomOfUser } from '../../utils/board-rooms'

/** Открытые комнаты и та, где этот читатель уже сидит, — чтобы вернуться. */
export default defineEventHandler(async (event) => {
  const user = await requireBoardUser(event)
  return { rooms: openRooms(), mine: roomOfUser(user.id) }
})
