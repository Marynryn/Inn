import type { MazeState } from "#shared/utils/maze";
import { mazeOpenTo, mazeState } from "../../utils/maze";

/** Страница лабиринта: лабиринт дня и свои забеги. Пока лабиринт — проба
 *  для админов, остальным его будто нет. */
export default defineEventHandler(async (event): Promise<MazeState> => {
  const session = await getUserSession(event);
  const user = session.user as { id?: number; role?: string } | undefined;
  if (!user?.id || !mazeOpenTo(user.role))
    throw createError({ statusCode: 404, message: "Лабиринта сейчас нет" });
  return mazeState(user.id, user.role);
});
