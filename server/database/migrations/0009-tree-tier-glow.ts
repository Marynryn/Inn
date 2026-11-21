import { addColumn, type Migration } from "./helpers";

/**
 * Свечение у редкости: слово рисуется светлее, а вокруг — ореол её цвета,
 * как у карточек персонажей. Нужно тёмным цветам вроде фиолетового: без
 * ореола такой текст на тёмном фоне не читается.
 *
 * И «Редкое» из миграции 8 становится золотым, если цвет ещё не трогали:
 * оранжевым оно было по ошибке.
 */
export const treeTierGlow: Migration = {
  version: 9,
  name: "свечение у редкости слов",
  async up(db) {
    await addColumn(db, "tree_tiers", "glow", "INTEGER NOT NULL DEFAULT 0");
    await db.execute(
      `UPDATE tree_tiers SET color = '#f2c14e' WHERE name = 'Редкое' AND color = '#ff9900'`,
    );
  },
};
