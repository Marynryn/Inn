import type { MazeState } from "#shared/utils/maze";
import { mazeState } from "../../utils/maze";
import { mazeVisitor } from "../../utils/maze-access";

/** Страница лабиринта: турнир, команды, свой забег дня. Гостю — без своего:
 *  смотреть можно, участвовать — после входа. */
export default defineEventHandler(async (event): Promise<MazeState> => {
  return mazeState(await mazeVisitor(event));
});
