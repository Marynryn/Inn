import { addColumn, type Migration } from "./helpers";

/**
 * После ивента надетый титул остаётся у человека насовсем, а показывать ли
 * его у имени — решает он сам: скрыть и вернуть можно сколько угодно. Пока
 * ивент идёт, флажка нет в ходу: там снятый титул пропадает.
 */
export const treeTitleHidden: Migration = {
  version: 7,
  name: "скрытый титул после ивента",
  async up(db) {
    await addColumn(db, "users", "title_hidden", "INTEGER NOT NULL DEFAULT 0");
  },
};
