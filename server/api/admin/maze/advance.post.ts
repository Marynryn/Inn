import { requireAdmin } from "../../../utils/admin-access";
import { advanceDay } from "../../../utils/maze-tournament";

/** Закончить день турнира сейчас, не дожидаясь полуночи, — для проверки. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  await advanceDay();
  return { ok: true };
});
