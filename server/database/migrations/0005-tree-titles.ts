import { addColumn, type Migration } from "./helpers";

// Первые слова для ёлки. Дальше они правятся в админке — здесь только то, с
// чем ёлка запускается на пустой базе.
const ADJ = [
  "Отважный",
  "Сонный",
  "Подозрительный",
  "Ворчливый",
  "Невыспавшийся",
  "Голодный",
  "Легендарный",
  "Липкий",
  "Почти Героический",
  "Слегка Проклятый",
  "Сертифицированный",
  "Блестящий",
  "Неуклюжий",
  "Задумчивый",
  "Взъерошенный",
  "Таинственный",
  "Зимний",
  "Праздничный",
  "Недооценённый",
  "Подмёрзший",
  "Запасной",
  "Бесстрашный",
  "Мечтательный",
  "Вечно Опаздывающий",
];
const ADJ_RARE = ["Избранный", "Непобедимый", "Великий", "Сияющий"];

const NOUN: [string, "m" | "f" | "n"][] = [
  ["Кашевар", "m"],
  ["Табурет", "m"],
  ["Пирожок", "m"],
  ["Бард", "m"],
  ["Рыцарь", "m"],
  ["Хранитель Ложек", "m"],
  ["Половник", "m"],
  ["Сугроб", "m"],
  ["Мешок Картошки", "m"],
  ["Кексик", "m"],
  ["Сковородка", "f"],
  ["Варежка", "f"],
  ["Сосулька", "f"],
  ["Кружка", "f"],
  ["Метла", "f"],
  ["Ёлочная Игрушка", "f"],
  ["Подушка", "f"],
  ["Мандаринка", "f"],
  ["Шишка", "f"],
  ["Полено", "n"],
  ["Привидение", "n"],
  ["Чучело", "n"],
  ["Одеяло", "n"],
];
const NOUN_RARE: [string, "m" | "f" | "n"][] = [
  ["Повелитель", "m"],
  ["Дракон", "m"],
  ["Владычица", "f"],
  ["Хранитель Таверны", "m"],
];

const TAIL = [
  "на полставки",
  "в отставке",
  "из Лискора",
  "без лицензии",
  "по средам",
  "под прикрытием",
  "первого уровня",
  "в валенках",
  "из-под стола",
  "по совместительству",
  "на испытательном сроке",
  "проездом",
  "после третьей кружки",
  "без выходных",
  "с печеньками",
  "в одном носке",
  "местного значения",
  "друг Гоблинов",
];
const TAIL_RARE = [
  "всея Изрила",
  "из древних легенд",
  "сотого уровня",
  "гроза Дрейков",
];

/**
 * Новогодняя ёлка и титулы.
 *
 * tree_words — слова, из которых складываются титулы. Прилагательное хранится
 * в мужском роде; женский и средний угадываются, а не вышло — вписываются
 * руками (word_f, word_n). У существительного — его род.
 *
 * user_titles — выигранное. Титул хранится готовым текстом: правка слов в
 * админке не должна переписывать то, что люди уже носят. Одна строка на
 * человека в день — это держит уникальный индекс, а не проверка в коде.
 * У админа, который трясёт без ограничений, к дню после первой попытки
 * дописано «#…»: индекс такие не держит, а доска их не показывает.
 *
 * users.title_id — надетый титул.
 */
export const treeTitles: Migration = {
  version: 5,
  name: "новогодняя ёлка и титулы",
  async up(db) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS tree_words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        word TEXT NOT NULL,
        word_f TEXT,
        word_n TEXT,
        gender TEXT,
        rare INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_titles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        rarity TEXT NOT NULL,
        gifts INTEGER NOT NULL,
        day TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS user_titles_user_day ON user_titles (user_id, day)`,
    );
    await db.execute(
      `CREATE INDEX IF NOT EXISTS user_titles_created ON user_titles (created_at)`,
    );
    await addColumn(db, "users", "title_id", "INTEGER");

    const has = await db.execute(`SELECT COUNT(*) AS n FROM tree_words`);
    if (Number(has.rows[0]!.n) > 0) return;

    type Row = [
      kind: string,
      word: string,
      gender: string | null,
      rare: number,
    ];
    const rows: Row[] = [
      ...ADJ.map((w): Row => ["adj", w, null, 0]),
      ...ADJ_RARE.map((w): Row => ["adj", w, null, 1]),
      ...NOUN.map(([w, g]): Row => ["noun", w, g, 0]),
      ...NOUN_RARE.map(([w, g]): Row => ["noun", w, g, 1]),
      ...TAIL.map((w): Row => ["tail", w, null, 0]),
      ...TAIL_RARE.map((w): Row => ["tail", w, null, 1]),
    ];
    for (const [kind, word, gender, rare] of rows)
      await db.execute({
        sql: `INSERT INTO tree_words (kind, word, gender, rare) VALUES (?, ?, ?, ?)`,
        args: [kind, word, gender, rare],
      });
  },
};
