import type { MazeBanner } from "#shared/utils/mazeTournament";
import { mazeBanner } from "../../utils/maze-tournament";

/** Плашка на главной и пункт меню. null — этому человеку ивента не видно. */
export default defineEventHandler(async (event): Promise<MazeBanner | null> => {
  const session = await getUserSession(event);
  return mazeBanner((session.user as { role?: string } | undefined)?.role);
});
