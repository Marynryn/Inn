import type { TreeState } from "#shared/utils/tree";
import {
  swapsFor,
  todaysTitle,
  toNameTitle,
  treeFor,
  wordBook,
  wornTitle,
} from "../../utils/tree";

/**
 * Окно ёлки: тексты и что знать о вошедшем — тряс ли он сегодня и что выпало.
 * Гостю (me: null) ёлку видно, но трясти её зовут после входа.
 */
export default defineEventHandler(async (event): Promise<TreeState> => {
  const session = await getUserSession(event);
  const user = session.user as { id?: number; role?: string } | undefined;
  const tree = await treeFor(user?.role);
  if (!tree) throw createError({ statusCode: 404, message: "Ёлки сейчас нет" });

  if (!user?.id) return { texts: tree.texts, me: null };

  const today = await todaysTitle(user.id);
  return {
    texts: tree.texts,
    me: {
      canShake: user.role === "admin" || !today,
      today: today ? toNameTitle(today, await wordBook()) : null,
      current: await wornTitle(user.id),
      swaps: today ? await swapsFor(user.id, today) : [],
    },
  };
});
