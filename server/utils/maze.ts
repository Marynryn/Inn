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
import { mazePlayableBy } from "#shared/utils/mazeTournament";
import { mazeRounds, mazeRuns } from "../database/schema";
import { useDb } from "./db";
import {
  mazeSettings,
  memberTeam,
  openRound,
  settle,
  tournamentView,
} from "./maze-tournament";
import { mskDay } from "./msk";

/**
 * Забеги по лабиринту: начать, принять ходы, показать.
 *
 * Забег дня турнира — один на человека в день, и только у вступившего. Лабиринт
 * дня у всех один (сид дня), а поворот у каждого свой. Тренировка — у админа:
 * лабиринт любого размера со своим сидом.
 */

type RunRow = typeof mazeRuns.$inferSelect;
type User = { id: number; role?: string };

const newSeed = () => randomBytes(16).toString("hex");

const isUniqueViolation = (e: any) =>
  /UNIQUE constraint failed/.test(
    `${e?.message ?? ""} ${e?.cause?.message ?? ""}`,
  );

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
    kind: run.kind === "practice" ? "practice" : "round",
    size: run.size,
    start: maze.start,
    exit: maze.exit,
    moves: run.moves,
    cells: cellsOf(maze, cellsAround(maze.size, path, MAZE_REVEAL)),
    ...timesOf(run, run.finishedAt, now),
  };
}

async function roundRun(userId: number, roundId: number) {
  const [row] = await useDb()
    .select()
    .from(mazeRuns)
    .where(
      and(
        eq(mazeRuns.userId, userId),
        eq(mazeRuns.kind, "round"),
        eq(mazeRuns.roundId, roundId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function lastPractice(userId: number) {
  const [row] = await useDb()
    .select()
    .from(mazeRuns)
    .where(and(eq(mazeRuns.userId, userId), eq(mazeRuns.kind, "practice")))
    .orderBy(desc(mazeRuns.id))
    .limit(1);
  return row ?? null;
}

/** Страница лабиринта: турнир, своя команда, свой забег дня. Кому лабиринта
 *  не видно, решает обработчик. */
export async function mazeState(
  user: User | null,
  now = Date.now(),
): Promise<MazeState> {
  const { mode } = await mazeSettings();
  const t = await settle(now);
  const open = t ? await openRound(t) : null;
  const isAdmin = user?.role === "admin";
  const practice = user && isAdmin ? await lastPractice(user.id) : null;
  const run = user && open ? await roundRun(user.id, open.id) : null;
  return {
    mode,
    me: user
      ? {
          team: t ? await memberTeam(t.id, user.id) : null,
          canPlay: mazePlayableBy(mode, user.role),
          isAdmin,
        }
      : null,
    tournament: t ? await tournamentView(t) : null,
    run: run ? viewOf(run, now) : null,
    practice: practice ? viewOf(practice, now) : null,
    practiceSizes: MAZE_PRACTICE_SIZES,
  };
}

/** Тренировка: новый лабиринт выбранного размера, прошлая стирается. */
export async function startPractice(
  user: User,
  size: unknown,
  now = Date.now(),
): Promise<MazeRunView> {
  if (user.role !== "admin")
    throw createError({ statusCode: 403, message: "Тренировка — для админов" });
  if (!isPracticeSize(size))
    throw createError({ statusCode: 400, message: "Нет такого размера" });
  const db = useDb();
  await db
    .delete(mazeRuns)
    .where(and(eq(mazeRuns.userId, user.id), eq(mazeRuns.kind, "practice")));
  const [row] = await db
    .insert(mazeRuns)
    .values({
      userId: user.id,
      kind: "practice",
      day: mskDay(now),
      size,
      seed: newSeed(),
      transform: randomInt(MAZE_TRANSFORMS),
      startedAt: now,
    })
    .returning();
  return viewOf(row!, now);
}

/**
 * Забег дня турнира. Время пошло с этой минуты — потому лабиринт и не
 * показывают до нажатия «Начать». Начатый и не пройденный забег продолжается
 * с того же места; пройденный второй раз не начать — и админу тоже: он здесь
 * такой же игрок.
 */
export async function startRoundRun(
  user: User,
  now = Date.now(),
): Promise<MazeRunView> {
  const { mode } = await mazeSettings();
  if (!mazePlayableBy(mode, user.role))
    throw createError({ statusCode: 403, message: "Лабиринт сейчас закрыт" });
  const t = await settle(now);
  const r = t ? await openRound(t) : null;
  if (!t || !r)
    throw createError({ statusCode: 409, message: "Турнир сейчас не идёт" });
  if (!(await memberTeam(t.id, user.id)))
    throw createError({
      statusCode: 409,
      message: "Сначала вступи в турнир",
    });

  const existing = await roundRun(user.id, r.id);
  if (existing) {
    if (existing.finishedAt === null) return viewOf(existing, now);
    throw createError({
      statusCode: 409,
      message: "Сегодняшний лабиринт уже пройден",
    });
  }

  try {
    const [row] = await useDb()
      .insert(mazeRuns)
      .values({
        userId: user.id,
        kind: "round",
        roundId: r.id,
        day: r.day,
        size: r.size,
        seed: r.seed,
        transform: randomInt(MAZE_TRANSFORMS),
        startedAt: now,
      })
      .returning();
    return viewOf(row!, now);
  } catch (e) {
    // Двойной клик или вторая вкладка: забег уже завёл соседний запрос.
    if (!isUniqueViolation(e)) throw e;
    const run = await roundRun(user.id, r.id);
    if (!run) throw e;
    return viewOf(run, now);
  }
}

const resync = () =>
  createError({ statusCode: 409, message: "Забег разошёлся с сервером" });

/** Забег дня турнира принимает ходы, пока идёт его день и открыт ивент. */
async function assertRoundOpen(run: RunRow, role: string | undefined) {
  const { mode } = await mazeSettings();
  if (!mazePlayableBy(mode, role))
    throw createError({ statusCode: 409, message: "Лабиринт сейчас закрыт" });
  await settle();
  const [r] = await useDb()
    .select({ closedAt: mazeRounds.closedAt })
    .from(mazeRounds)
    .where(eq(mazeRounds.id, run.roundId ?? -1));
  if (!r || r.closedAt !== null)
    throw createError({
      statusCode: 409,
      message: "Этот день турнира закончился",
    });
}

/**
 * Ходы забега. Страница шлёт их пачками по мере того, как фишка идёт, и
 * помечает, с какого хода пачка начинается (at). Пачка, которая уже дошла, но
 * ответ на неё потерялся, придёт снова — её ходы не повторяются, а клетки
 * отдаются ещё раз.
 *
 * Сквозь стену хода нет: такая пачка не принимается целиком. Дошли до выхода —
 * время записывается в эту же минуту, по часам сервера. День турнира
 * закончился — его забег ходов больше не принимает: итоги уже подведены.
 */
export async function applyMoves(
  user: User,
  runId: number,
  at: number,
  moves: string,
): Promise<MazeMoveResult> {
  const db = useDb();
  const [run] = await db
    .select()
    .from(mazeRuns)
    .where(and(eq(mazeRuns.id, runId), eq(mazeRuns.userId, user.id)));
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
    if (run.kind === "round") await assertRoundOpen(run, user.role);
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
