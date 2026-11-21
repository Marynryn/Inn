import { randomBytes, randomInt } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type {
  Maze,
  MazeCell,
  MazeMoveResult,
  MazeRunView,
  MazeState,
} from "#shared/utils/maze";
import {
  MAZE_DAILY_SIZE,
  MAZE_MOVES_MAX,
  MAZE_PRACTICE_SIZES,
  MAZE_REVEAL,
  MAZE_TRANSFORMS,
  cellsAround,
  generateMaze,
  isPracticeSize,
  transformMaze,
  walk,
} from "#shared/utils/maze";
import { mazeDays, mazeRuns } from "../database/schema";
import { useDb } from "./db";
import { mskDay } from "./msk";

type RunRow = typeof mazeRuns.$inferSelect;

/** Кому открыт лабиринт. Пока это проба — только админам; читателю лабиринта
 *  будто нет. Турниры откроют его всем. */
export const mazeOpenTo = (role: string | undefined) => role === "admin";

const newSeed = () => randomBytes(16).toString("hex");

const isUniqueViolation = (e: any) =>
  /UNIQUE constraint failed/.test(
    `${e?.message ?? ""} ${e?.cause?.message ?? ""}`,
  );

/** Лабиринт дня: первый, кто пришёл за день, заводит его сид. Двое пришли
 *  разом — запись одна, второй берёт уже заведённую. */
export async function mazeDay(day = mskDay()) {
  const db = useDb();
  await db
    .insert(mazeDays)
    .values({ day, seed: newSeed(), size: MAZE_DAILY_SIZE })
    .onConflictDoNothing();
  const [row] = await db.select().from(mazeDays).where(eq(mazeDays.day, day));
  return row!;
}

/** Лабиринт забега — таким, каким его видит игрок. */
const mazeOf = (run: Pick<RunRow, "seed" | "size" | "transform">): Maze =>
  transformMaze(generateMaze(run.seed, run.size), run.transform);

const cellsOf = (maze: Maze, set: Iterable<number>): MazeCell[] =>
  [...set].sort((a, b) => a - b).map((i) => [i, maze.cells[i]!]);

/** Путь по записанным ходам. Записываются только проверенные ходы, так что
 *  сбой здесь — испорченная запись, а не ход игрока. */
function pathOf(maze: Maze, moves: string): number[] {
  const w = walk(maze, moves);
  if (!w.ok)
    throw createError({ statusCode: 500, message: "Забег записан с ошибкой" });
  return w.path;
}

const timesOf = (run: RunRow, finishedAt: number | null, now: number) => ({
  elapsedMs: (finishedAt ?? now) - run.startedAt,
  finishedMs: finishedAt === null ? null : finishedAt - run.startedAt,
});

export function viewOf(run: RunRow, now = Date.now()): MazeRunView {
  const maze = mazeOf(run);
  const path = pathOf(maze, run.moves);
  return {
    id: run.id,
    kind: run.kind,
    size: run.size,
    start: maze.start,
    exit: maze.exit,
    moves: run.moves,
    cells: cellsOf(maze, cellsAround(maze.size, path, MAZE_REVEAL)),
    ...timesOf(run, run.finishedAt, now),
  };
}

async function dailyRun(userId: number, day: string) {
  const [row] = await useDb()
    .select()
    .from(mazeRuns)
    .where(
      and(
        eq(mazeRuns.userId, userId),
        eq(mazeRuns.kind, "daily"),
        eq(mazeRuns.day, day),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Что показать на странице: лабиринт дня и забеги этого человека. */
export async function mazeState(
  userId: number,
  role: string | undefined,
): Promise<MazeState> {
  const day = await mazeDay();
  const daily = await dailyRun(userId, day.day);
  const [practice] = await useDb()
    .select()
    .from(mazeRuns)
    .where(and(eq(mazeRuns.userId, userId), eq(mazeRuns.kind, "practice")))
    .orderBy(desc(mazeRuns.id))
    .limit(1);
  return {
    day: day.day,
    dailySize: day.size,
    practiceSizes: MAZE_PRACTICE_SIZES,
    daily: daily ? viewOf(daily) : null,
    practice: practice ? viewOf(practice) : null,
    canRestart: role === "admin",
  };
}

/**
 * Начать забег. Время пошло с этой минуты — потому лабиринт и не показывают
 * до нажатия «Начать».
 *
 * Лабиринт дня: начатый и не пройденный забег продолжается с того же места,
 * пройденный второй раз не начать. Админ начинает заново сколько угодно — его
 * прошлый забег за день стирается, и поворот выпадает новый.
 *
 * Тренировка — только у админа: лабиринт любого размера со своим сидом.
 * Прошлая тренировка при этом стирается.
 */
export async function startRun(
  userId: number,
  role: string | undefined,
  opts: { kind: "daily" | "practice"; size?: unknown; restart?: boolean },
): Promise<MazeRunView> {
  const db = useDb();
  const now = Date.now();
  const transform = randomInt(MAZE_TRANSFORMS);

  if (opts.kind === "practice") {
    if (role !== "admin")
      throw createError({
        statusCode: 403,
        message: "Тренировка — для админов",
      });
    if (!isPracticeSize(opts.size))
      throw createError({ statusCode: 400, message: "Нет такого размера" });
    await db
      .delete(mazeRuns)
      .where(and(eq(mazeRuns.userId, userId), eq(mazeRuns.kind, "practice")));
    const [row] = await db
      .insert(mazeRuns)
      .values({
        userId,
        kind: "practice",
        day: mskDay(now),
        size: opts.size,
        seed: newSeed(),
        transform,
        startedAt: now,
      })
      .returning();
    return viewOf(row!, now);
  }

  const day = await mazeDay(mskDay(now));
  const existing = await dailyRun(userId, day.day);
  if (existing) {
    if (role === "admin" && opts.restart)
      await db.delete(mazeRuns).where(eq(mazeRuns.id, existing.id));
    else if (existing.finishedAt === null) return viewOf(existing, now);
    else
      throw createError({
        statusCode: 409,
        message: "Сегодняшний лабиринт уже пройден",
      });
  }

  try {
    const [row] = await db
      .insert(mazeRuns)
      .values({
        userId,
        kind: "daily",
        day: day.day,
        size: day.size,
        seed: day.seed,
        transform,
        startedAt: now,
      })
      .returning();
    return viewOf(row!, now);
  } catch (e) {
    // Двойной клик или вторая вкладка: забег уже завёл соседний запрос.
    if (!isUniqueViolation(e)) throw e;
    const run = await dailyRun(userId, day.day);
    if (!run) throw e;
    return viewOf(run, now);
  }
}

const resync = () =>
  createError({ statusCode: 409, message: "Забег разошёлся с сервером" });

/**
 * Ходы забега. Страница шлёт их пачками по мере того, как фишка идёт, и
 * помечает, с какого хода пачка начинается (at). Пачка, которая уже дошла, но
 * ответ на неё потерялся, придёт снова — её ходы не повторяются, а клетки
 * отдаются ещё раз.
 *
 * Сквозь стену хода нет: такая пачка не принимается целиком. Дошли до выхода —
 * время записывается в эту же минуту, по часам сервера.
 */
export async function applyMoves(
  userId: number,
  runId: number,
  at: number,
  moves: string,
): Promise<MazeMoveResult> {
  const db = useDb();
  const [run] = await db
    .select()
    .from(mazeRuns)
    .where(and(eq(mazeRuns.id, runId), eq(mazeRuns.userId, userId)));
  if (!run) throw createError({ statusCode: 404, message: "Забега нет" });

  const stored = run.moves;
  if (at > stored.length) throw resync();
  // Начало пачки уже записано — оно должно совпасть с записанным.
  const overlap = stored.slice(at, at + moves.length);
  if (moves.slice(0, overlap.length) !== overlap) throw resync();
  const fresh = moves.slice(overlap.length);

  const maze = mazeOf(run);
  const before = pathOf(maze, stored);
  let all = stored;
  let finishedAt = run.finishedAt;

  if (fresh && finishedAt === null) {
    if (stored.length + fresh.length > MAZE_MOVES_MAX)
      throw createError({ statusCode: 413, message: "Слишком длинный забег" });
    const step = walk(maze, fresh, before.at(-1));
    if (!step.ok)
      throw createError({ statusCode: 409, message: "Сквозь стену не пройти" });
    all = stored + fresh.slice(0, step.used);
    if (step.finished) finishedAt = Date.now();
    // Запись — только если с чтения никто не успел дописать ходы.
    const saved = await db
      .update(mazeRuns)
      .set({ moves: all, finishedAt })
      .where(and(eq(mazeRuns.id, run.id), eq(mazeRuns.moves, stored)))
      .returning({ id: mazeRuns.id });
    if (!saved.length) throw resync();
  }

  const path = pathOf(maze, all);
  const known = cellsAround(maze.size, path.slice(0, at + 1), MAZE_REVEAL);
  const opened = [...cellsAround(maze.size, path, MAZE_REVEAL)].filter(
    (c) => !known.has(c),
  );
  return {
    cells: cellsOf(maze, opened),
    ...timesOf(run, finishedAt, Date.now()),
  };
}
