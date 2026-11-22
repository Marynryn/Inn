import { mazeVisitor } from "../../utils/maze-access";

/** Видно ли лабиринт тому, кто пришёл. Нет — 404: страница /maze отдаёт
 *  настоящую 404, пока ивент не открыт для всех. */
export default defineEventHandler(async (event) => {
  await mazeVisitor(event);
  return { ok: true };
});
