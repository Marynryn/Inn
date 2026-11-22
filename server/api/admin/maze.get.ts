import type { MazeTournamentView } from "#shared/utils/mazeTournament";
import { requireAdmin } from "../../utils/admin-access";
import type { MazeSettings } from "../../utils/maze-tournament";
import {
  mazeSettings,
  settle,
  tournamentView,
} from "../../utils/maze-tournament";

/** Вкладка «Лабиринт»: режим, размеры по дням и что с турниром. */
export default defineEventHandler(
  async (
    event,
  ): Promise<{
    settings: MazeSettings;
    tournament: MazeTournamentView | null;
  }> => {
    await requireAdmin(event);
    const t = await settle();
    return {
      settings: await mazeSettings(),
      tournament: t ? await tournamentView(t) : null,
    };
  },
);
