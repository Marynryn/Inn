import type { Migration } from "./helpers";

/**
 * Лабиринт ивента.
 *
 * maze_days — лабиринт каждого дня: его сид и размер. Сид случайный и лежит
 * только здесь — не в site_settings, которые сайт отдаёт всем: зная сид,
 * лабиринт можно было бы собрать заранее. Размер записан при первом
 * обращении за день, чтобы правка размеров не меняла уже начатый лабиринт.
 *
 * maze_runs — забеги. Лабиринт в забеге — по сиду и размеру, повёрнутый на
 * transform (0–7). Ходы хранятся строкой «URDL…»: по ним сервер знает, где
 * фишка и что ей уже открыто, и проверяет каждый следующий ход. Время — от
 * started_at до finished_at, в миллисекундах, по часам сервера.
 *
 * Зачётный забег дня — один на человека: это держит уникальный индекс. Админ
 * проходит лабиринт дня заново — его прошлый забег за день удаляется.
 */
export const maze: Migration = {
  version: 11,
  name: "лабиринт",
  async up(db) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS maze_days (
        day TEXT PRIMARY KEY,
        seed TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS maze_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        day TEXT NOT NULL,
        size INTEGER NOT NULL,
        seed TEXT NOT NULL,
        transform INTEGER NOT NULL,
        moves TEXT NOT NULL DEFAULT '',
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS maze_runs_daily ON maze_runs (user_id, day) WHERE kind = 'daily'`,
    );
    await db.execute(
      `CREATE INDEX IF NOT EXISTS maze_runs_user ON maze_runs (user_id, kind)`,
    );
  },
};
