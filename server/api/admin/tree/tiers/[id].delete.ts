import { eq } from "drizzle-orm";
import { treeTiers, treeWords, userTitles } from "../../../../database/schema";
import { requireAdmin } from "../../../../utils/admin-access";
import { useDb } from "../../../../utils/db";

/** Убрать редкость. Её слова становятся обычными, выпавшие с ней титулы —
 *  тоже: текст у них прежний, просто без цвета. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = Number(getRouterParam(event, "id"));
  const db = useDb();
  const gone = Number.isInteger(id)
    ? await db.delete(treeTiers).where(eq(treeTiers.id, id)).returning()
    : [];
  if (!gone.length)
    throw createError({ statusCode: 404, message: "Такой редкости нет" });
  await db
    .update(treeWords)
    .set({ tierId: null })
    .where(eq(treeWords.tierId, id));
  await db
    .update(userTitles)
    .set({ tierId: null })
    .where(eq(userTitles.tierId, id));
  return { ok: true };
});
