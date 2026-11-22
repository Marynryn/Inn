import type { H3Event } from "h3";
import { mazeVisibleTo } from "#shared/utils/mazeTournament";
import { mazeSettings } from "./maze-tournament";

export type MazeUser = { id: number; role?: string };

/** Кто пришёл и видно ли ему лабиринт. Не видно — 404, будто его и нет. */
export async function mazeVisitor(event: H3Event): Promise<MazeUser | null> {
  const session = await getUserSession(event);
  const user = session.user as { id?: number; role?: string } | undefined;
  const { mode } = await mazeSettings();
  if (!mazeVisibleTo(mode, user?.role))
    throw createError({ statusCode: 404, message: "Лабиринта сейчас нет" });
  return user?.id ? { id: user.id, role: user.role } : null;
}

/** То же, но только для вошедших: играть гостю нельзя. */
export async function mazePlayer(event: H3Event): Promise<MazeUser> {
  const user = await mazeVisitor(event);
  if (!user)
    throw createError({
      statusCode: 401,
      message: "Войди, чтобы участвовать",
    });
  return user;
}
