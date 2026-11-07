import { recordCardGame } from "../../utils/card-stats";
import { checkRateLimit } from "../../utils/rate-limit";
import { clientIp } from "../../utils/client-ip";

/**
 * Партия против компьютера доиграна — для счётчика в админке. Партия живёт
 * в браузере, сервер о ней не знает, поэтому зовёт страница, один раз в
 * конце. Админы и боты не в счёт. Проверить, что партия была, нельзя —
 * лимит не даёт накрутить счётчик: партия идёт минуты, а не секунды.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (session.user?.role === "admin" || isBotRequest(event))
    return { counted: false };

  const who = session.user?.id ?? clientIp(event);
  if (!checkRateLimit(`cards-finished:${who}`, 20, 60 * 60 * 1000))
    return { counted: false };

  await recordCardGame("computer");
  return { counted: true };
});
