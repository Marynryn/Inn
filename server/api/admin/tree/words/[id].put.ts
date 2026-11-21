import { eq } from "drizzle-orm";
import { treeWords } from "../../../../database/schema";
import { requireAdmin } from "../../../../utils/admin-access";
import { useDb } from "../../../../utils/db";
import { wordFromBody } from "../../../../utils/tree-words";

/** Правка слова. Уже выигранные титулы не меняются — они хранятся текстом. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = Number(getRouterParam(event, "id"));
  const db = useDb();
  const [old] = Number.isInteger(id)
    ? await db.select().from(treeWords).where(eq(treeWords.id, id))
    : [];
  if (!old) throw createError({ statusCode: 404, message: "Такого слова нет" });

  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
  const set = wordFromBody(body, old.kind);
  if (!Object.keys(set).length) return { word: old };

  const [word] = await db
    .update(treeWords)
    .set(set)
    .where(eq(treeWords.id, id))
    .returning();
  return { word };
});
