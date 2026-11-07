import type { Migration } from "./helpers";

/**
 * «Карты таверны»: сколько партий доиграно за день — отдельно против
 * компьютера и на двоих. Как у настольной игры, строка на день, без людей.
 */
export const cardGameDays: Migration = {
  version: 4,
  name: "доигранные партии в карты по дням",
  async up(db) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS card_game_days (
        day TEXT NOT NULL,
        mode TEXT NOT NULL,
        finished INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, mode)
      )
    `);
  },
};
