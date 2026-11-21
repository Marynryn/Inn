import { addColumn, type Migration } from "./helpers";

/**
 * Редкости слов ёлки — свои, заводятся в админке: название, цвет, шанс и
 * «сверху доски». Раньше было одно «золотое» слово (tree_words.rare) с общим
 * шансом tree_rare_chance; оно становится редкостью «Редкое» с тем же шансом,
 * а его слова и выпавшие с ним титулы — её. «Необычное» не заводится: оно
 * выходит само у слов из двух и больше слов (shared/utils/tree.ts).
 *
 * Старые столбцы tree_words.rare и user_titles.rarity остаются: rarity ещё
 * пишется для истории, rare больше не читается.
 */
export const treeTiers: Migration = {
  version: 8,
  name: "редкости слов ёлки",
  async up(db) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS tree_tiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        chance REAL NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await addColumn(db, "tree_words", "tier_id", "INTEGER");
    await addColumn(db, "user_titles", "tier_id", "INTEGER");

    const had = await db.execute(`SELECT COUNT(*) AS n FROM tree_tiers`);
    if (Number(had.rows[0]?.n ?? 0) > 0) return;

    const setting = await db.execute(
      `SELECT value FROM site_settings WHERE key = 'tree_rare_chance'`,
    );
    const raw = Number(setting.rows[0]?.value);
    const rareChance =
      Number.isFinite(raw) && setting.rows.length
        ? Math.min(100, Math.max(0, raw))
        : 3;

    const rare = await db.execute({
      sql: `INSERT INTO tree_tiers (name, color, chance, pinned) VALUES (?, ?, ?, 1) RETURNING id`,
      args: ["Редкое", "#f2c14e", rareChance],
    });
    const rareId = Number(rare.rows[0]!.id);
    await db.execute({
      sql: `UPDATE tree_words SET tier_id = ? WHERE rare = 1`,
      args: [rareId],
    });
    await db.execute({
      sql: `UPDATE user_titles SET tier_id = ? WHERE rarity = 'rare'`,
      args: [rareId],
    });
  },
};
