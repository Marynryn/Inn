import { useDb } from "../../utils/db";
import {
  commentReactions,
  comments,
  notifications,
} from "../../database/schema";
import { eq, inArray, or } from "drizzle-orm";
import { requireAdmin } from "../../utils/admin-access";

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const id = Number(getRouterParam(event, "id"));
  const db = useDb();

  // Вместе с корневым комментарием уходит и вся его ветка: оставшиеся ответы
  // висели бы сиротами — показать их не под чем, а в базе они копятся.
  // У ответа своей ветки нет, поэтому второе условие просто ничего не найдёт.
  const doomed = await db
    .select({ id: comments.id })
    .from(comments)
    .where(or(eq(comments.id, id), eq(comments.parentId, id)));

  if (!doomed.length) return { ok: true };

  const ids = doomed.map((r) => r.id);

  // Уведомления об этих ответах убираем сами. В списке они и так не показались
  // бы — там внутреннее соединение с comments, — но копиться в базе им незачем.
  // Реакции на удалённые реплики тоже — иначе они копятся сиротами. Одной
  // транзакцией: оборвись запрос посередине, ветка не останется наполовину.
  await db.batch([
    db.delete(notifications).where(inArray(notifications.commentId, ids)),
    db.delete(commentReactions).where(inArray(commentReactions.commentId, ids)),
    db.delete(comments).where(inArray(comments.id, ids)),
  ]);

  return { ok: true };
});
