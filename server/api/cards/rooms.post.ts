import { requireBoardUser } from '../../utils/board-access'
import { createCardsRoom } from '../../utils/cards-rooms'

/** Новый стол «Карт таверны». Пока карты в разработке — только админам;
 *  друг садится за стол по ссылке, как в настольной игре. */
export default defineEventHandler(async (event) => {
  const user = await requireBoardUser(event)
  if (!user.admin) throw createError({ statusCode: 403, message: 'Карты пока открыты только админам' })
  return { code: createCardsRoom() }
})
