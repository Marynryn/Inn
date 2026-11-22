import type { MazeMoveResult } from "#shared/utils/maze";
import { MAZE_MOVES_PER_REQUEST } from "#shared/utils/maze";
import { applyMoves } from "../../utils/maze";
import { mazePlayer } from "../../utils/maze-access";

const MOVES_RE = new RegExp(`^[URDL]{1,${MAZE_MOVES_PER_REQUEST}}$`);

/** Ходы забега пачкой. Что за стенами и дошли ли до выхода, решает сервер:
 *  в ответ — клетки, которые эти ходы открыли, и время. */
export default defineEventHandler(async (event): Promise<MazeMoveResult> => {
  const user = await mazePlayer(event);
  const body = await readBody<{
    runId?: unknown;
    at?: unknown;
    moves?: unknown;
  }>(event).catch(() => null);
  const { runId, at, moves } = body ?? {};
  if (
    !Number.isSafeInteger(runId) ||
    !Number.isSafeInteger(at) ||
    (at as number) < 0 ||
    typeof moves !== "string" ||
    !MOVES_RE.test(moves)
  )
    throw createError({ statusCode: 400, message: "Непонятные ходы" });

  return applyMoves(user, runId as number, at as number, moves);
});
