import type { H3Event } from "h3";
import { eq } from "drizzle-orm";
import { users } from "../database/schema";
import { useDb } from "./db";

/**
 * Пускает только действующего админа — по базе, а не по сессии. Сессия — это
 * запечатанная кука на 30 дней: снятая роль, бан или смена пароля её не
 * отзывают, и украденная кука админа работала бы до конца срока. Запрос по
 * первичному ключу — дешёвый, а на одно обращение он делается один раз.
 */
export async function requireAdmin(event: H3Event): Promise<number> {
  if (typeof event.context.adminId === "number") return event.context.adminId;

  const session = await getUserSession(event);
  const id = (session.user as { id?: number } | undefined)?.id;

  const [row] = id
    ? await useDb()
        .select({ role: users.role, isBanned: users.isBanned })
        .from(users)
        .where(eq(users.id, id))
    : [];

  if (!id || !row || row.role !== "admin" || row.isBanned) {
    throw createError({ statusCode: 403, message: "Нет доступа" });
  }

  event.context.adminId = id;
  return id;
}
