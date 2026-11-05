import { useDb } from "../../../utils/db";
import { commentReactions, comments } from "../../../database/schema";
import { eq, and, isNull } from "drizzle-orm";
import { notifyLike } from "../../../utils/like-notify";
import { anonId } from "../../../utils/anon-id";
import { checkRateLimit } from "../../../utils/rate-limit";

export default defineEventHandler(async (event) => {
  const commentId = Number(getRouterParam(event, "id"));
  const { type } = await readBody<{ type: "like" | "dislike" }>(event);

  if (type !== "like" && type !== "dislike") {
    throw createError({
      statusCode: 400,
      message: "type must be like or dislike",
    });
  }

  const ip = clientIp(event);
  if (!checkRateLimit(`react:${ip}`, 60, 60_000)) {
    throw createError({
      statusCode: 429,
      message: "Слишком часто. Подожди минуту.",
    });
  }

  const db = useDb();

  // Реакция на несуществующий комментарий осталась бы в базе сиротой.
  const [comment] = Number.isInteger(commentId)
    ? await db
        .select({ id: comments.id })
        .from(comments)
        .where(eq(comments.id, commentId))
    : [];
  if (!comment)
    throw createError({ statusCode: 404, message: "Комментарий не найден" });

  const session = await getUserSession(event);
  const userId = session.user?.id ?? null;
  // Гость — по своей куке, не по IP: за одним IP бывают разные люди.
  const anon = userId ? null : anonId(event, true);

  const existing = userId
    ? await db
        .select()
        .from(commentReactions)
        .where(
          and(
            eq(commentReactions.commentId, commentId),
            eq(commentReactions.userId, userId),
          ),
        )
    : await db
        .select()
        .from(commentReactions)
        .where(
          and(
            eq(commentReactions.commentId, commentId),
            eq(commentReactions.anonId, anon!),
            isNull(commentReactions.userId),
          ),
        );

  const [mine] = existing;
  if (mine) {
    if (mine.type === type) {
      // Снять реакцию
      await db.delete(commentReactions).where(eq(commentReactions.id, mine.id));
      return { action: "removed", type };
    } else {
      // Переключить тип
      await db
        .update(commentReactions)
        .set({ type })
        .where(eq(commentReactions.id, mine.id));
      if (type === "like") await notifyLike(commentId, userId);
      return { action: "switched", type };
    }
  }

  // Второй такой же запрос, проскочивший мимо проверки выше (двойной клик),
  // упрётся в уникальный индекс и ничего не добавит.
  const inserted = await db
    .insert(commentReactions)
    .values({ commentId, type, userId, anonId: anon })
    .onConflictDoNothing()
    .returning({ id: commentReactions.id });
  // Дизлайк автору не несём: от него только огорчение, а пользы никакой.
  if (inserted.length && type === "like") await notifyLike(commentId, userId);
  return { action: "added", type };
});
