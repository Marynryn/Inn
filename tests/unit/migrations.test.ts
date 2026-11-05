import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MIGRATIONS } from "../../server/database/migrations";
import { migrateDatabase } from "../../server/utils/migrate";

const dir = mkdtempSync(join(tmpdir(), "inn-migrate-"));
const db = () => createClient({ url: `file:${dir}/db.sqlite` });

beforeAll(() => {
  process.env.STORAGE_DIR = dir;
  process.env.ADMIN_PASSWORD = "unit-test-password";
});
afterAll(() => {
  // На Windows открытый файл базы не удалить — папка останется во временных,
  // это не повод валить прогон.
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("миграции", () => {
  it("номера идут подряд с единицы", () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(
      MIGRATIONS.map((_, i) => i + 1),
    );
  });

  it("пустая база доходит до последней версии, с таблицами и первым админом", async () => {
    await migrateDatabase();
    const c = db();
    const version = (await c.execute("PRAGMA user_version")).rows[0]!
      .user_version;
    expect(Number(version)).toBe(MIGRATIONS.at(-1)!.version);

    const tables = (
      await c.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    ).rows.map((r) => r.name);
    for (const t of [
      "chapters",
      "users",
      "comments",
      "comment_reactions",
      "reels",
    ])
      expect(tables).toContain(t);

    const admins = await c.execute(
      "SELECT email FROM users WHERE role = 'admin'",
    );
    expect(admins.rows.map((r) => r.email)).toEqual(["admin@tavern.local"]);
    c.close();
  });

  it("повторный старт миграций не запускает и данных не трогает", async () => {
    const c = db();
    await c.execute(
      "INSERT INTO comments (author_name, body) VALUES ('Гость', 'привет')",
    );
    c.close();

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await migrateDatabase();
    const ran = log.mock.calls.filter((args) =>
      /^\[migrate\] \d+:/.test(String(args[0])),
    );
    log.mockRestore();
    expect(ran).toEqual([]);

    const c2 = db();
    const n = (await c2.execute("SELECT COUNT(*) AS n FROM comments")).rows[0]!
      .n;
    expect(Number(n)).toBe(1);
    c2.close();
  });

  it("второй одинаковый лайк база не примет", async () => {
    const c = db();
    await c.execute(
      "INSERT INTO comment_reactions (comment_id, type, user_id) VALUES (1, 'like', 1)",
    );
    await expect(
      c.execute(
        "INSERT INTO comment_reactions (comment_id, type, user_id) VALUES (1, 'like', 1)",
      ),
    ).rejects.toThrow(/UNIQUE/);
    c.close();
  });
});
