import { requireAdmin } from "../../../../utils/admin-access";
import { deleteTournament } from "../../../../utils/maze-tournament";

/** Удалить турнир со всеми днями, составами и забегами — уборка после пробы. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = Number(getRouterParam(event, "id"));
  if (!Number.isSafeInteger(id))
    throw createError({ statusCode: 400, message: "Какой турнир?" });
  await deleteTournament(id);
  return { ok: true };
});
