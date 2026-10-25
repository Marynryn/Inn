import { requireBoardUser } from '../../utils/board-access'
import { createRoom } from '../../utils/board-rooms'

/** Новая комната. За стол создатель садится, когда страница комнаты подключится. */
export default defineEventHandler(async (event) => {
  const user = await requireBoardUser(event)
  return { code: createRoom(user) }
})
