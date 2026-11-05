import { type Migration } from "./helpers";

/**
 * Одна реакция от человека на комментарий — это держит база, а не проверка в
 * коде: двойной клик проскакивал между чтением и записью и ставил два лайка.
 * Перед индексами убираем накопившиеся повторы (остаётся первая реакция) и
 * реакции на удалённые комментарии.
 */
export const commentReactionsUnique: Migration = {
  version: 2,
  name: "одна реакция от человека на комментарий",
  async up(db) {
    await db.execute(
      "DELETE FROM comment_reactions WHERE comment_id NOT IN (SELECT id FROM comments)",
    );
    await db.execute(`
      DELETE FROM comment_reactions WHERE user_id IS NOT NULL AND id NOT IN (
        SELECT MIN(id) FROM comment_reactions WHERE user_id IS NOT NULL
        GROUP BY comment_id, user_id)
    `);
    await db.execute(`
      DELETE FROM comment_reactions WHERE user_id IS NULL AND id NOT IN (
        SELECT MIN(id) FROM comment_reactions WHERE user_id IS NULL
        GROUP BY comment_id, ip)
    `);
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS comment_reactions_guest
        ON comment_reactions (comment_id, ip) WHERE user_id IS NULL
    `);
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS comment_reactions_user
        ON comment_reactions (comment_id, user_id) WHERE user_id IS NOT NULL
    `);
  },
};
