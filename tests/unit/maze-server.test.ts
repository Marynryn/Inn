import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Maze, MazeDir, MazeRunView } from "../../shared/utils/maze";
import {
  MAZE_DIRS,
  MAZE_REVEAL,
  generateMaze,
  isOpen,
  neighbor,
  transformMaze,
} from "../../shared/utils/maze";

/**
 * Забеги на настоящей базе во временной папке: старт, продолжение, ходы,
 * повтор потерянной пачки, финиш. Обработчики Nitro здесь не поднимаются —
 * createError подставлен свой.
 */

const dir = mkdtempSync(join(tmpdir(), "inn-maze-"));

vi.stubGlobal("createError", (o: { statusCode: number; message: string }) =>
  Object.assign(new Error(o.message), o),
);

let maze: typeof import("../../server/utils/maze");
let db: ReturnType<typeof import("../../server/utils/db").useDb>;
let runs: typeof import("../../server/database/schema").mazeRuns;

beforeAll(async () => {
  process.env.STORAGE_DIR = dir;
  process.env.ADMIN_PASSWORD = "unit-test-password";
  const { migrateDatabase } = await import("../../server/utils/migrate");
  await migrateDatabase();
  maze = await import("../../server/utils/maze");
  db = (await import("../../server/utils/db")).useDb();
  runs = (await import("../../server/database/schema")).mazeRuns;
});
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

/** Лабиринт забега так, как его видит игрок, — тест его знает, страница нет. */
async function mazeOfRun(id: number): Promise<Maze> {
  const [row] = await db.select().from(runs).where(eq(runs.id, id));
  return transformMaze(generateMaze(row!.seed, row!.size), row!.transform);
}

function route(m: Maze): string {
  const from = new Map<number, [number, MazeDir]>();
  const queue = [m.start];
  const seen = new Set(queue);
  while (queue.length) {
    const c = queue.shift()!;
    for (const d of MAZE_DIRS) {
      if (!isOpen(m.cells[c]!, d)) continue;
      const n = neighbor(m.size, c, d)!;
      if (seen.has(n)) continue;
      seen.add(n);
      from.set(n, [c, d]);
      queue.push(n);
    }
  }
  let moves = "";
  for (let c = m.exit; c !== m.start; ) {
    const [prev, d] = from.get(c)!;
    moves = d + moves;
    c = prev;
  }
  return moves;
}

const READER = 101;
const ADMIN = 1;

describe("лабиринт на сервере", () => {
  let run: MazeRunView;
  let m: Maze;

  it("забег дня: лабиринт целиком не выдаётся", async () => {
    run = await maze.startRun(READER, "reader", { kind: "daily" });
    m = await mazeOfRun(run.id);
    expect(run.moves).toBe("");
    expect(run.finishedMs).toBeNull();
    // Только клетки вокруг входа.
    const sx = m.start % m.size;
    const sy = Math.floor(m.start / m.size);
    for (const [i, bits] of run.cells) {
      const d = Math.hypot((i % m.size) - sx, Math.floor(i / m.size) - sy);
      expect(d).toBeLessThanOrEqual(MAZE_REVEAL);
      expect(bits).toBe(m.cells[i]);
    }
    expect(run.cells.length).toBeLessThan((m.size * m.size) / 4);
  });

  it("второй старт продолжает тот же забег", async () => {
    const again = await maze.startRun(READER, "reader", { kind: "daily" });
    expect(again.id).toBe(run.id);
  });

  it("сквозь стену не пройти", async () => {
    const wall = MAZE_DIRS.find((d) => !isOpen(m.cells[m.start]!, d))!;
    await expect(
      maze.applyMoves(READER, run.id, 0, wall),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("чужой забег не принимается", async () => {
    await expect(
      maze.applyMoves(READER + 1, run.id, 0, route(m)[0]!),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("ходы открывают клетки, повтор пачки ничего не ломает", async () => {
    const r = route(m);
    const first = await maze.applyMoves(READER, run.id, 0, r.slice(0, 3));
    expect(first.cells.length).toBeGreaterThan(0);
    expect(first.finishedMs).toBeNull();
    // Ответ потерялся — та же пачка приходит снова: те же клетки, ходы не
    // задвоились.
    const retry = await maze.applyMoves(READER, run.id, 0, r.slice(0, 3));
    expect(retry.cells).toEqual(first.cells);
    const [row] = await db.select().from(runs).where(eq(runs.id, run.id));
    expect(row!.moves).toBe(r.slice(0, 3));
    // Пачка, которая начинается дальше записанного, — расхождение.
    await expect(
      maze.applyMoves(READER, run.id, 10, r.slice(10, 12)),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("дошли до выхода — время записано, второй раз не начать", async () => {
    const r = route(m);
    const done = await maze.applyMoves(READER, run.id, 3, r.slice(3));
    expect(done.finishedMs).not.toBeNull();
    expect(done.finishedMs).toBeGreaterThanOrEqual(0);
    const view = (await maze.mazeState(READER, "reader")).daily!;
    expect(view.finishedMs).toBe(done.finishedMs);
    expect(view.moves).toBe(r);
    await expect(
      maze.startRun(READER, "reader", { kind: "daily" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("админ проходит лабиринт дня заново, тренировка — только у админа", async () => {
    const a = await maze.startRun(ADMIN, "admin", { kind: "daily" });
    const b = await maze.startRun(ADMIN, "admin", {
      kind: "daily",
      restart: true,
    });
    expect(b.id).not.toBe(a.id);
    // Лабиринт тот же — сид дня, — а поворот может быть другим.
    const [ra] = await db.select().from(runs).where(eq(runs.id, b.id));
    const [rr] = await db.select().from(runs).where(eq(runs.id, run.id));
    expect(ra!.seed).toBe(rr!.seed);

    await expect(
      maze.startRun(READER, "reader", { kind: "practice", size: 11 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      maze.startRun(ADMIN, "admin", { kind: "practice", size: 12 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    const p = await maze.startRun(ADMIN, "admin", {
      kind: "practice",
      size: 11,
    });
    expect(p.size).toBe(11);
    expect((await maze.mazeState(ADMIN, "admin")).practice?.id).toBe(p.id);
  });
});
