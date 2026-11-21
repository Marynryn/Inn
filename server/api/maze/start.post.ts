import type { MazeRunView } from "#shared/utils/maze";
import { mazeOpenTo, startRun } from "../../utils/maze";

/** Начать забег: лабиринт дня или тренировку. Время пошло с этого запроса. */
export default defineEventHandler(async (event): Promise<MazeRunView> => {
  const session = await getUserSession(event);
  const user = session.user as { id?: number; role?: string } | undefined;
  if (!user?.id || !mazeOpenTo(user.role))
    throw createError({ statusCode: 404, message: "Лабиринта сейчас нет" });

  const body = await readBody<{
    kind?: unknown;
    size?: unknown;
    restart?: unknown;
  }>(event).catch(() => null);
  const kind = body?.kind;
  if (kind !== "daily" && kind !== "practice")
    throw createError({ statusCode: 400, message: "Какой забег начать?" });

  return startRun(user.id, user.role, {
    kind,
    size: body?.size,
    restart: body?.restart === true,
  });
});
