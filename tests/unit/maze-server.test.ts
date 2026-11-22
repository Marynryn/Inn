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
import type { MazeTeam } from "../../shared/utils/mazeTournament";

/**
 * Лабиринт и турнир на настоящей базе во временной папке: вступление и
 * команды, забег дня, ходы и повтор потерянной пачки, итоги дня, полночь и
 * кнопка «закончить день», конец турнира. Обработчики Nitro здесь не
 * поднимаются — createError подставлен свой.
 */

const dir = mkdtempSync(join(tmpdir(), "inn-maze-"));

vi.stubGlobal("createError", (o: { statusCode: number; message: string }) =>
  Object.assign(new Error(o.message), o),
);

let maze: typeof import("../../server/utils/maze");
let tour: typeof import("../../server/utils/maze-tournament");
let db: ReturnType<typeof import("../../server/utils/db").useDb>;
let schema: typeof import("../../server/database/schema");

const ADMIN = { id: 1, role: "admin" };
const ANNA = { id: 2, role: "reader" };
const BORIS = { id: 3, role: "reader" };

beforeAll(async () => {
  process.env.STORAGE_DIR = dir;
  process.env.ADMIN_PASSWORD = "unit-test-password";
  const { migrateDatabase } = await import("../../server/utils/migrate");
  await migrateDatabase();
  maze = await import("../../server/utils/maze");
  tour = await import("../../server/utils/maze-tournament");
  db = (await import("../../server/utils/db")).useDb();
  schema = await import("../../server/database/schema");
  await db.insert(schema.users).values([
    { id: 2, email: "anna@test.local", displayName: "Анна" },
    { id: 3, email: "boris@test.local", displayName: "Борис" },
  ]);
  await db.insert(schema.siteSettings).values([
    { key: "maze_mode", value: "on" },
    { key: "maze_sizes", value: "9,11,13,15,17" },
  ]);
});
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

/** Лабиринт забега так, как его видит игрок, — тест его знает, страница нет. */
async function mazeOfRun(id: number): Promise<Maze> {
  const [row] = await db
    .select()
    .from(schema.mazeRuns)
    .where(eq(schema.mazeRuns.id, id));
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

async function play(user: typeof ANNA) {
  const run = await maze.startRoundRun(user);
  const m = await mazeOfRun(run.id);
  return maze.applyMoves(user, run.id, 0, route(m));
}

describe("турнир на сервере", () => {
  let annaTeam: MazeTeam;
  let run: MazeRunView;
  let m: Maze;

  it("без турнира вступить и играть нельзя", async () => {
    await expect(tour.joinTournament(ANNA.id)).rejects.toMatchObject({
      statusCode: 409,
    });
    const s = await maze.mazeState(ANNA);
    expect(s.tournament).toBeNull();
  });

  it("турнир начинается с дня 1 и лабиринта первого размера", async () => {
    await tour.startTournament();
    const s = await maze.mazeState(ANNA);
    expect(s.tournament?.round).toBe(1);
    expect(s.tournament?.results[0]?.size).toBe(9);
    expect(s.tournament?.nextSize).toBe(11);
    expect(s.me?.team).toBeNull();
    // Второй турнир, пока идёт первый, не начать.
    await expect(tour.startTournament()).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("не вступив, забег не начать", async () => {
    await expect(maze.startRoundRun(ANNA)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("двое вступивших — в разных командах; повторное вступление ничего не меняет", async () => {
    annaTeam = await tour.joinTournament(ANNA.id);
    const borisTeam = await tour.joinTournament(BORIS.id);
    expect(borisTeam).not.toBe(annaTeam);
    expect(await tour.joinTournament(ANNA.id)).toBe(annaTeam);
    const s = await maze.mazeState(ANNA);
    expect(s.me?.team).toBe(annaTeam);
    expect(s.tournament?.teams[annaTeam].map((p) => p.name)).toEqual(["Анна"]);
  });

  it("забег дня: лабиринт целиком не выдаётся", async () => {
    run = await maze.startRoundRun(ANNA);
    m = await mazeOfRun(run.id);
    expect(run.kind).toBe("round");
    expect(run.size).toBe(9);
    const sx = m.start % m.size;
    const sy = Math.floor(m.start / m.size);
    for (const [i, bits] of run.cells) {
      const d = Math.hypot((i % m.size) - sx, Math.floor(i / m.size) - sy);
      expect(d).toBeLessThanOrEqual(MAZE_REVEAL);
      expect(bits).toBe(m.cells[i]);
    }
    // Второй старт продолжает тот же забег.
    expect((await maze.startRoundRun(ANNA)).id).toBe(run.id);
  });

  it("сквозь стену не пройти, чужой забег не принимается", async () => {
    const wall = MAZE_DIRS.find((d) => !isOpen(m.cells[m.start]!, d))!;
    await expect(maze.applyMoves(ANNA, run.id, 0, wall)).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(
      maze.applyMoves(BORIS, run.id, 0, route(m)[0]!),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("повтор потерянной пачки ничего не ломает", async () => {
    const r = route(m);
    const first = await maze.applyMoves(ANNA, run.id, 0, r.slice(0, 3));
    const retry = await maze.applyMoves(ANNA, run.id, 0, r.slice(0, 3));
    expect(retry.cells).toEqual(first.cells);
    const [row] = await db
      .select()
      .from(schema.mazeRuns)
      .where(eq(schema.mazeRuns.id, run.id));
    expect(row!.moves).toBe(r.slice(0, 3));
  });

  it("дошла до выхода — её команда ведёт день, второй раз не начать", async () => {
    const r = route(m);
    const done = await maze.applyMoves(ANNA, run.id, 3, r.slice(3));
    expect(done.finishedMs).not.toBeNull();
    const s = await maze.mazeState(ANNA);
    const today = s.tournament!.results[0]!;
    expect(today.closed).toBe(false);
    expect(today.leader).toBe(annaTeam);
    expect(today.best[annaTeam]?.name).toBe("Анна");
    // Сегодняшний день очка ещё не дал.
    expect(s.tournament!.score.points[annaTeam]).toBe(0);
    await expect(maze.startRoundRun(ANNA)).rejects.toMatchObject({
      statusCode: 409,
    });
    const banner = await tour.mazeBanner("reader");
    expect(banner?.tournament?.today?.team).toBe(annaTeam);
  });

  it("день закончили кнопкой — очко засчитано, начатый забег ходов не принимает", async () => {
    const borisRun = await maze.startRoundRun(BORIS);
    const bm = await mazeOfRun(borisRun.id);
    await tour.advanceDay();
    await expect(
      maze.applyMoves(BORIS, borisRun.id, 0, route(bm)),
    ).rejects.toMatchObject({ statusCode: 409 });

    const s = await maze.mazeState(ANNA);
    expect(s.tournament!.round).toBe(2);
    expect(s.tournament!.results[1]!.size).toBe(11);
    expect(s.tournament!.score.points[annaTeam]).toBe(1);
    // На новый день — новый забег.
    expect(s.run).toBeNull();
  });

  it("в полночь день закрывается сам — с теми, кто успел до неё", async () => {
    // Борис проходит день 2, и всё это переносится во вчера: день, забег.
    const res = await play(BORIS);
    expect(res.finishedMs).not.toBeNull();
    const DAY = 86_400_000;
    const yesterday = new Date(Date.now() + 3 * 3600_000 - DAY)
      .toISOString()
      .slice(0, 10);
    const [r2] = await db
      .select()
      .from(schema.mazeRounds)
      .where(eq(schema.mazeRounds.round, 2));
    await db
      .update(schema.mazeRounds)
      .set({ day: yesterday })
      .where(eq(schema.mazeRounds.id, r2!.id));
    const [br] = await db
      .select()
      .from(schema.mazeRuns)
      .where(eq(schema.mazeRuns.roundId, r2!.id));
    await db
      .update(schema.mazeRuns)
      .set({
        startedAt: br!.startedAt - DAY,
        finishedAt: br!.finishedAt! - DAY,
      })
      .where(eq(schema.mazeRuns.id, br!.id));

    const s = await maze.mazeState(BORIS);
    expect(s.tournament!.round).toBe(3);
    const day2 = s.tournament!.results[1]!;
    expect(day2.closed).toBe(true);
    expect(day2.leader).not.toBe(annaTeam);
    expect(day2.best[day2.leader!]?.name).toBe("Борис");
    // Новый день начался сегодня — следующий за вчерашним.
    expect(s.tournament!.results[2]!.day > yesterday).toBe(true);
    expect(s.tournament!.score.points).toEqual({ goblins: 1, antinium: 1 });
  });

  it("закрылся последний день — турнир окончен, можно начинать следующий", async () => {
    await tour.advanceDay();
    await tour.advanceDay();
    await tour.advanceDay();
    const s = await maze.mazeState(ANNA);
    expect(s.tournament!.finished).toBe(true);
    expect(s.tournament!.round).toBeNull();
    expect(s.tournament!.score.points).toEqual({
      [annaTeam]: 1,
      [annaTeam === "goblins" ? "antinium" : "goblins"]: 1,
    });
    await expect(tour.advanceDay()).rejects.toMatchObject({ statusCode: 409 });
    await expect(tour.joinTournament(ANNA.id)).rejects.toMatchObject({
      statusCode: 409,
    });

    const next = await tour.startTournament();
    expect((await maze.mazeState(ANNA)).tournament!.number).toBe(2);
    // Пробный турнир убирается целиком.
    await tour.deleteTournament(next.id);
    expect((await maze.mazeState(ANNA)).tournament!.number).toBe(1);
  });

  it("тренировка — только у админа и только своих размеров", async () => {
    await expect(maze.startPractice(ANNA, 11)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(maze.startPractice(ADMIN, 12)).rejects.toMatchObject({
      statusCode: 400,
    });
    const p = await maze.startPractice(ADMIN, 11);
    expect(p.kind).toBe("practice");
    expect((await maze.mazeState(ADMIN)).practice?.id).toBe(p.id);
    expect((await maze.mazeState(ANNA)).practice).toBeNull();
  });

  it("режим «только для админов»: читатель играть не может", async () => {
    await db
      .update(schema.siteSettings)
      .set({ value: "admins" })
      .where(eq(schema.siteSettings.key, "maze_mode"));
    await tour.startTournament();
    expect((await maze.mazeState(ANNA)).me?.canPlay).toBe(false);
    await tour.joinTournament(ADMIN.id);
    await expect(maze.startRoundRun(ANNA)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect((await maze.startRoundRun(ADMIN)).kind).toBe("round");
    expect(await tour.mazeBanner("reader")).toBeNull();
    expect(await tour.mazeBanner("admin")).not.toBeNull();
  });
});
