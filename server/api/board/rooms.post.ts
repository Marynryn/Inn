import { BOARD_MAPS, isBoardMapId } from "#shared/utils/board";
import { requireBoardUser } from "../../utils/board-access";
import { createRoom } from "../../utils/board-rooms";

/** Новая комната на выбранной карте. За стол создатель садится, когда
 *  страница комнаты подключится. Карту в работе накрывают только админы. */
export default defineEventHandler(async (event) => {
  const user = await requireBoardUser(event);
  const body = await readBody<{ map?: unknown }>(event).catch(() => null);
  const map = isBoardMapId(body?.map) ? body.map : "v1";
  if (BOARD_MAPS[map].adminOnly && !user.admin)
    throw createError({ statusCode: 403, message: "Эта карта ещё готовится" });
  return { code: createRoom(user, map) };
});
