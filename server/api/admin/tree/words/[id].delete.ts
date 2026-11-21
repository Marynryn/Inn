import { eq } from "drizzle-orm";
import { treeWords } from "../../../../database/schema";
import { requireAdmin } from "../../../../utils/admin-access";
import { useDb } from "../../../../utils/db";

/** Удалить слово. Титулы, где оно уже есть, остаются как были. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = Number(getRouterParam(event, "id"));
  const gone = Number.isInteger(id)
    ? await useDb().delete(treeWords).where(eq(treeWords.id, id)).returning()
    : [];
  if (!gone.length)
    throw createError({ statusCode: 404, message: "Такого слова нет" });
  return { ok: true };
});
