import { useDb } from "../../utils/db";
import { chapters } from "../../database/schema";
import { asc } from "drizzle-orm";

/**
 * Все главы для панели, черновики тоже, с полем isPublished для метки
 * «черновик». Права проверяет server/middleware/admin-guard.ts.
 */
export default defineEventHandler(async () => {
  return useDb()
    .select({
      id: chapters.id,
      volume: chapters.volume,
      title: chapters.title,
      publishedAt: chapters.publishedAt,
      sortOrder: chapters.sortOrder,
      wordCount: chapters.wordCount,
      isPublished: chapters.isPublished,
    })
    .from(chapters)
    .orderBy(asc(chapters.sortOrder));
});
