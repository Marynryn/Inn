import { openRooms } from '../../utils/board-rooms'
import { openCardsRooms } from '../../utils/cards-rooms'

/** Есть ли столы, что ищут игроков (обеих игр), — для точки у ссылки в меню. Открыто
 *  всем: гость тоже может сесть за стол, назвавшись. */
export default defineEventHandler(() => ({ open: openRooms().length + openCardsRooms().length }))
