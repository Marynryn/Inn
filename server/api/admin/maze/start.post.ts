import { requireAdmin } from "../../../utils/admin-access";
import { startTournament } from "../../../utils/maze-tournament";

/** Начать турнир: первый день — сегодня. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const t = await startTournament();
  return { id: t.id };
});
