import { eq } from "drizzle-orm";
import { users } from "../../database/schema";
import { useDb } from "../../utils/db";
import { takeHandoffTicket } from "../../utils/handoff";
import { afterLogin, toSessionUser } from "../../utils/identity";

/**
 * Вторая половина входа через телеграм на зеркале: основной домен проверил
 * подпись телеграма и отправил браузер сюда с билетом (см. utils/handoff.ts).
 * Билет превращается в сессию на этом домене, дальше — куда человек и шёл.
 */
export default defineEventHandler(async (event) => {
  const handoff = takeHandoffTicket(getQuery(event).t);
  if (!handoff) {
    console.error("[auth] handoff: билет не принят");
    return sendRedirect(event, "/login?error=telegram&reason=handoff");
  }

  const [user] = await useDb()
    .select()
    .from(users)
    .where(eq(users.id, handoff.userId));
  if (!user || user.isBanned) {
    return sendRedirect(event, "/login?error=telegram&reason=handoff-user");
  }

  await setUserSession(event, { user: await toSessionUser(user) });
  return sendRedirect(event, afterLogin(event, handoff.created));
});
