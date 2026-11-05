import { addColumn, type Migration } from "./helpers";

/**
 * Гость, поставивший реакцию, опознаётся по своей куке tavern_anon, а не по
 * IP: за одним IP (мобильный оператор, офис) бывают разные люди. Старые
 * гостевые реакции остаются с одним ip — в счётчиках они есть, но ничьи.
 *
 * Как и у реакций по аккаунту, одна реакция гостя на комментарий — это держит
 * уникальный индекс; повторы, если успели набежать, убираем перед ним.
 */
export const commentReactionsAnon: Migration = {
  version: 3,
  name: "реакции гостей по куке",
  async up(db) {
    await addColumn(db, "comment_reactions", "anon_id", "TEXT");
    await db.execute(`
      DELETE FROM comment_reactions WHERE anon_id IS NOT NULL AND user_id IS NULL
        AND id NOT IN (
          SELECT MIN(id) FROM comment_reactions
          WHERE anon_id IS NOT NULL AND user_id IS NULL
          GROUP BY comment_id, anon_id)
    `);
    // Был обычный индекс по anon_id — уникальный его заменяет.
    await db.execute("DROP INDEX IF EXISTS comment_reactions_anon");
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS comment_reactions_guest_anon
        ON comment_reactions (comment_id, anon_id)
        WHERE user_id IS NULL AND anon_id IS NOT NULL
    `);
  },
};
