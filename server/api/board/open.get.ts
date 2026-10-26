import { openRooms } from '../../utils/board-rooms'

/** Есть ли столы, что ищут игроков, — для точки у ссылки в меню. Открыто
 *  всем: гость тоже может сесть за стол, назвавшись. */
export default defineEventHandler(() => ({ open: openRooms().length }))
