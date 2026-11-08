import { requireBoardUser } from "../../utils/board-access";
import { createCardsRoom } from "../../utils/cards-rooms";

/** Новый стол «Странствующей колоды». Накрывает любой вошедший; друг садится
 *  за стол по ссылке, как в настольной игре. */
export default defineEventHandler(async (event) => {
  await requireBoardUser(event);
  return { code: createCardsRoom() };
});
