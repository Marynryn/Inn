import { useDb } from "../../../utils/db";
import { chapters } from "../../../database/schema";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (session.user?.role !== "admin") throw createError({ statusCode: 403 });

  const { ids } = await readBody<{ ids: string[] }>(event);
  if (!Array.isArray(ids))
    throw createError({ statusCode: 400, message: "ids must be array" });

  const db = useDb();
  // Одной транзакцией: порядок либо меняется целиком, либо не меняется вовсе —
  // оборванная на середине перестановка оставляла бы главы вперемешку.
  const updates = ids.map((id, i) =>
    db
      .update(chapters)
      .set({ sortOrder: i + 1 })
      .where(eq(chapters.id, String(id))),
  );
  if (updates.length) await db.batch(updates as [any, ...any[]]);

  return { ok: true };
});
