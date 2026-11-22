import type { MazeRunView } from "#shared/utils/maze";
import { startPractice, startRoundRun } from "../../utils/maze";
import { mazePlayer } from "../../utils/maze-access";

/** Начать забег: лабиринт дня турнира или тренировку. Время пошло с этого
 *  запроса. */
export default defineEventHandler(async (event): Promise<MazeRunView> => {
  const user = await mazePlayer(event);
  const body = await readBody<{ kind?: unknown; size?: unknown }>(event).catch(
    () => null,
  );
  if (body?.kind === "practice") return startPractice(user, body.size);
  if (body?.kind === "round") return startRoundRun(user);
  throw createError({ statusCode: 400, message: "Какой забег начать?" });
});
