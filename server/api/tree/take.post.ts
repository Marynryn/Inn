import { isWordKind } from "#shared/utils/tree";
import { takeTitle } from "../../utils/tree";

/** Взять выпавший сегодня титул вместо надетого — целиком или одно его слово
 *  (slot) в свой. Прежний пропадает. */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const user = session.user as { id?: number } | undefined;
  if (!user?.id) throw createError({ statusCode: 401, message: "Нужно войти" });

  const body = await readBody<{ id?: unknown; slot?: unknown }>(event);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0)
    throw createError({ statusCode: 400, message: "Неизвестный титул" });
  const slot = body?.slot == null ? undefined : body.slot;
  if (slot !== undefined && !isWordKind(slot))
    throw createError({ statusCode: 400, message: "Неизвестное место слова" });

  return takeTitle(user.id, id, slot);
});
