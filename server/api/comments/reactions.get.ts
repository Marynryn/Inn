import { and, eq, isNull } from "drizzle-orm";
import { commentReactions, comments } from "../../database/schema";
import { anonId } from "../../utils/anon-id";
import { useDb } from "../../utils/db";

/**
 * Реакции самого читателя под комментариями главы (или под отзывами о
 * проекте): { [id комментария]: "like" | "dislike" }. Вошедший — по аккаунту,
 * гость — по своей куке. Личный ответ, поэтому отдельно от общего списка:
 * страница спрашивает его из браузера после загрузки.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const siteWide = query.siteWide === "1" || query.site === "true";
  const chapterId = typeof query.chapterId === "string" ? query.chapterId : "";
  if (!chapterId && !siteWide) {
    throw createError({
      statusCode: 400,
      message: "Нужен chapterId или siteWide=1",
    });
  }

  const session = await getUserSession(event);
  const userId = (session.user as { id?: number } | undefined)?.id ?? null;
  const anon = userId ? null : anonId(event);
  // Гость, ни разу не ставивший реакцию, куки не имеет — и своих реакций тоже.
  if (!userId && !anon) return {};

  const rows = await useDb()
    .select({
      commentId: commentReactions.commentId,
      type: commentReactions.type,
    })
    .from(commentReactions)
    .innerJoin(comments, eq(comments.id, commentReactions.commentId))
    .where(
      and(
        siteWide
          ? isNull(comments.chapterId)
          : eq(comments.chapterId, chapterId),
        userId
          ? eq(commentReactions.userId, userId)
          : and(
              eq(commentReactions.anonId, anon!),
              isNull(commentReactions.userId),
            ),
      ),
    );

  return Object.fromEntries(rows.map((r) => [r.commentId, r.type])) as Record<
    string,
    "like" | "dislike"
  >;
});
