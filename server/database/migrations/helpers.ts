import type { Client, Transaction } from "@libsql/client";

/** То, чем миграция ходит в базу: само подключение или транзакция. */
export type Db = Client | Transaction;

type MigrationBase = {
  /** Номер — он же PRAGMA user_version после миграции. Только растёт. */
  version: number;
  name: string;
};

/**
 * Миграция идёт одной транзакцией вместе с отметкой версии: либо вся, либо
 * никак. Вне транзакции (transaction: false) — только базовая: в ней свои
 * транзакции и PRAGMA, которые внутри другой транзакции не работают.
 */
export type Migration = MigrationBase &
  (
    | {
        transaction: false;
        up: (db: Client, ctx: { storageDir: string }) => Promise<void>;
      }
    | {
        transaction?: true;
        up: (db: Transaction, ctx: { storageDir: string }) => Promise<void>;
      }
  );

export async function hasColumn(db: Db, table: string, column: string) {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  return info.rows.some((row) => row.name === column);
}

/**
 * Добавляет столбец, если его ещё нет. Раньше ALTER шёл в try/catch с
 * пустым catch — и вместе с «столбец уже есть» глотал любую настоящую ошибку.
 * Возвращает true, если столбец добавлен сейчас.
 */
export async function addColumn(
  db: Db,
  table: string,
  column: string,
  definition: string,
): Promise<boolean> {
  if (await hasColumn(db, table, column)) return false;
  await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}
