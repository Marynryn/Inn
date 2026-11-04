import { useDb } from "../../utils/db";
import { chapters } from "../../database/schema";
import { asc, eq } from "drizzle-orm";

/**
 * Публичный список глав — только опубликованные, кто бы ни спрашивал.
 *
 * Сессию здесь не читаем вовсе: ответ уезжает в payload страниц, и если бы
 * админу он приходил другим, первый же его заход положил бы черновики в общий
 * кеш. Поля isPublished в ответе нет — в этом списке оно всегда было бы true,
 * а без поля утечка черновика видна сразу. Админка берёт полный список из
 * /api/admin/chapters.
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
    })
    .from(chapters)
    .where(eq(chapters.isPublished, true))
    .orderBy(asc(chapters.sortOrder));
});
