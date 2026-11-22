import type { MazeTeam } from "#shared/utils/mazeTournament";
import { mazePlayableBy } from "#shared/utils/mazeTournament";
import { mazePlayer } from "../../utils/maze-access";
import { joinTournament, mazeSettings } from "../../utils/maze-tournament";

/** Вступить в идущий турнир. Команду назначает сервер — на весь турнир. */
export default defineEventHandler(
  async (event): Promise<{ team: MazeTeam }> => {
    const user = await mazePlayer(event);
    const { mode } = await mazeSettings();
    if (!mazePlayableBy(mode, user.role))
      throw createError({ statusCode: 403, message: "Лабиринт сейчас закрыт" });
    return { team: await joinTournament(user.id) };
  },
);
