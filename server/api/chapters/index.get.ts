import { useDb } from "../../utils/db";
import { chapters } from "../../database/schema";
import { asc, eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const db = useDb();
  const query = db
    .select({
      id: chapters.id,
      volume: chapters.volume,
      title: chapters.title,
      publishedAt: chapters.publishedAt,
      sortOrder: chapters.sortOrder,
      wordCount: chapters.wordCount,
      isPublished: chapters.isPublished,
    })
    .from(chapters);

  const rows =
    session.user?.role === "admin"
      ? await query.orderBy(asc(chapters.sortOrder))
      : await query
          .where(eq(chapters.isPublished, true))
          .orderBy(asc(chapters.sortOrder));

  return rows;
});
