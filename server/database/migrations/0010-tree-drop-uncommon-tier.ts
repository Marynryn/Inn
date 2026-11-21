import type { Migration } from "./helpers";

/**
 * «Необычное» больше не редкость из админки, а выходит само — у слов из двух
 * и больше слов. Заведённая раньше пустая «Необычное» убирается; если ей уже
 * отметили слова — остаётся, как есть.
 */
export const treeDropUncommonTier: Migration = {
  version: 10,
  name: "необычное — само, без записи в редкостях",
  async up(db) {
    await db.execute(`
      DELETE FROM tree_tiers
      WHERE name = 'Необычное'
        AND NOT EXISTS (SELECT 1 FROM tree_words WHERE tier_id = tree_tiers.id)
    `);
  },
};
