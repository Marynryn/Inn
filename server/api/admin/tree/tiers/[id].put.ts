import { eq } from "drizzle-orm";
import { treeTiers } from "../../../../database/schema";
import { requireAdmin } from "../../../../utils/admin-access";
import { useDb } from "../../../../utils/db";
import { tierFromBody } from "../../../../utils/tree-tiers";

/** Правка редкости. Цвет и название сразу видны и у уже выпавших титулов. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = Number(getRouterParam(event, "id"));
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
  const set = tierFromBody(body);
  const db = useDb();
  const [tier] = Number.isInteger(id)
    ? Object.keys(set).length
      ? await db
          .update(treeTiers)
          .set(set)
          .where(eq(treeTiers.id, id))
          .returning()
      : await db.select().from(treeTiers).where(eq(treeTiers.id, id))
    : [];
  if (!tier)
    throw createError({ statusCode: 404, message: "Такой редкости нет" });
  return { tier };
});
