import { useDb } from "../../utils/db";
import { chapterStats } from "../../database/schema";
import { eq } from "drizzle-orm";

/**
 * Сброс счётчиков просмотров и скачиваний — необратимо. Только POST: по GET
 * хватало открыть ссылку (кука сессии с SameSite=Lax едет и при переходе с
 * чужого сайта), и сброс мог сработать от клика по ссылке в комментарии.
 *
 *   POST /api/admin/stats-reset  { "confirm": "yes", "chapterId"?: "4.20" }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ confirm?: unknown; chapterId?: unknown }>(
    event,
  ).catch(() => undefined);
  if (body?.confirm !== "yes") {
    throw createError({
      statusCode: 400,
      message:
        'Передайте { "confirm": "yes" } в теле запроса, чтобы подтвердить сброс статистики (необратимо)',
    });
  }

  const db = useDb();
  const chapterId = body.chapterId ? String(body.chapterId) : null;

  if (chapterId) {
    await db
      .update(chapterStats)
      .set({ viewsCount: 0, downloadsCount: 0 })
      .where(eq(chapterStats.chapterId, chapterId));
    return { ok: true, reset: chapterId };
  }

  await db.update(chapterStats).set({ viewsCount: 0, downloadsCount: 0 });
  return { ok: true, reset: "all" };
});
