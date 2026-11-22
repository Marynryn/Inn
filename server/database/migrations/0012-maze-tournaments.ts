import { addColumn, type Migration } from "./helpers";

/**
 * Турниры лабиринта.
 *
 * maze_tournaments — турнир: сколько в нём дней и когда закончился.
 *
 * maze_rounds — дни турнира. У каждого свой лабиринт (сид, размер) и день по
 * Москве, когда он идёт. closed_at — когда подведены итоги: в полночь после
 * своего дня или раньше, если админ закончил день кнопкой. Следующий день
 * заводится тогда же; один номер дня в турнире держит уникальный индекс, так
 * что два запроса в полночь не заведут его дважды.
 *
 * maze_members — кто в турнире и за какую команду. Команда — на весь турнир.
 *
 * maze_runs.round_id — забег дня турнира (kind = 'round'). Один на человека в
 * день: уникальный индекс. Лабиринт дня без турнира (maze_days, kind = 'daily'
 * из миграции 11) больше не заводится: его заменили дни турниров.
 */
export const mazeTournaments: Migration = {
  version: 12,
  name: "турниры лабиринта",
  async up(db) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS maze_tournaments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        days INTEGER NOT NULL,
        finished_at INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS maze_rounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        round INTEGER NOT NULL,
        day TEXT NOT NULL,
        seed TEXT NOT NULL,
        size INTEGER NOT NULL,
        closed_at INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS maze_rounds_number ON maze_rounds (tournament_id, round)`,
    );
    await db.execute(`
      CREATE TABLE IF NOT EXISTS maze_members (
        tournament_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        team TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (tournament_id, user_id)
      )
    `);
    await addColumn(db, "maze_runs", "round_id", "INTEGER");
    await db.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS maze_runs_round ON maze_runs (user_id, round_id) WHERE kind = 'round'`,
    );
  },
};
