/**
 * Лабиринт ивента: то, что нужно и серверу, и странице.
 *
 * Лабиринт дня один на всех, но каждому он выдаётся повёрнутым или отражённым
 * (восемь вариантов): длина пути и тупики у всех те же, а подсказка «первый
 * поворот налево» у соседа не работает.
 *
 * Целиком лабиринт знает только сервер. Странице он отдаёт клетки вокруг
 * пройденного — чуть дальше, чем светит фонарь, чтобы фишка не ждала сети на
 * каждом шаге. Время забега тоже считает сервер: от выдачи лабиринта до хода,
 * которым дошли до выхода.
 */

import type { MazeMode, MazeTeam, MazeTournamentView } from "./mazeTournament";

export type MazeDir = "U" | "R" | "D" | "L";
export const MAZE_DIRS: readonly MazeDir[] = ["U", "R", "D", "L"];

/** Открытый проход из клетки — бит в её числе. */
export const DIR_BIT: Record<MazeDir, number> = { U: 1, R: 2, D: 4, L: 8 };
export const DIR_DX: Record<MazeDir, number> = { U: 0, R: 1, D: 0, L: -1 };
export const DIR_DY: Record<MazeDir, number> = { U: -1, R: 0, D: 1, L: 0 };
export const OPPOSITE: Record<MazeDir, MazeDir> = {
  U: "D",
  R: "L",
  D: "U",
  L: "R",
};

export const isMazeDir = (v: unknown): v is MazeDir =>
  v === "U" || v === "R" || v === "D" || v === "L";

/** Клетки идут по строкам: номер = y * size + x. В числе клетки — какие из
 *  неё открыты проходы (DIR_BIT). Вход — в одном углу, выход — в
 *  противоположном. */
export type Maze = {
  size: number;
  cells: number[];
  start: number;
  exit: number;
};

/** Как далеко светит фонарь — в клетках, от центра до центра. */
export const MAZE_LIGHT = 2.3;
/** Сколько клеток сервер отдаёт вокруг пройденного: на клетку дальше фонаря,
 *  чтобы фишка шла, не дожидаясь ответа на каждый шаг. */
export const MAZE_REVEAL = MAZE_LIGHT + 1;

/** Размеры тренировки, из которых выбирает админ. */
export const MAZE_PRACTICE_SIZES = [9, 11, 13, 15, 17, 19, 21, 25] as const;
export const isPracticeSize = (v: unknown): v is number =>
  typeof v === "number" &&
  (MAZE_PRACTICE_SIZES as readonly number[]).includes(v);

/** Сколько ходов принимаем за раз и за весь забег — заслон от мусора, а не
 *  правило игры: честный забег в разы короче. */
export const MAZE_MOVES_PER_REQUEST = 400;
export const MAZE_MOVES_MAX = 20_000;

// ── Случайность от строки ────────────────────────────────────────────────
// Один и тот же сид даёт один и тот же лабиринт — на сервере и в тестах.

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Генератор чисел в [0, 1) от строки (sfc32). */
export function rngFrom(seed: string): () => number {
  let [a, b, c, d] = cyrb128(seed);
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

// ── Клетки и проходы ─────────────────────────────────────────────────────

/** Соседняя клетка в эту сторону — или null, если там край. */
export function neighbor(size: number, i: number, d: MazeDir): number | null {
  const x = (i % size) + DIR_DX[d];
  const y = Math.floor(i / size) + DIR_DY[d];
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return y * size + x;
}

export const isOpen = (bits: number, d: MazeDir) => (bits & DIR_BIT[d]) !== 0;

export const openCount = (bits: number) =>
  MAZE_DIRS.reduce((n, d) => n + (isOpen(bits, d) ? 1 : 0), 0);

/**
 * Куда фишка едет сама дальше. Шаг идёт до развилки: в коридоре (ровно два
 * прохода) она поворачивает вместе с ним, а на развилке, в тупике и на выходе
 * останавливается — дальше решает игрок. На телефоне иначе пришлось бы
 * свайпать на каждую клетку.
 */
export function corridorNext(bits: number, came: MazeDir): MazeDir | null {
  if (openCount(bits) !== 2) return null;
  const back = OPPOSITE[came];
  return MAZE_DIRS.find((d) => d !== back && isOpen(bits, d)) ?? null;
}

// ── Генерация ────────────────────────────────────────────────────────────

/** Как часто растущее дерево берёт самую свежую клетку, а не случайную:
 *  чем чаще, тем длиннее коридоры и дороже ошибка на развилке. */
const NEWEST_SHARE = 0.65;
/** Доля тупиков, которые пробиваются в соседа: петли дают второй путь, и
 *  промах на развилке не отправляет в самое начало. */
const BRAID_SHARE = 0.12;

/**
 * Лабиринт по сиду: растущее дерево (все клетки связаны, путь от входа до
 * выхода есть всегда), потом немного петель. Вход — левый верхний угол,
 * выход — правый нижний; поворот для игрока делает transformMaze.
 */
export function generateMaze(seed: string, size: number): Maze {
  const rnd = rngFrom(`${seed}:${size}`);
  const pick = <T>(list: readonly T[]): T =>
    list[Math.floor(rnd() * list.length)]!;
  const total = size * size;
  const cells = new Array<number>(total).fill(0);
  const seen = new Uint8Array(total);

  const carve = (from: number, d: MazeDir, to: number) => {
    cells[from]! |= DIR_BIT[d];
    cells[to]! |= DIR_BIT[OPPOSITE[d]];
  };

  const first = Math.floor(rnd() * total);
  seen[first] = 1;
  const active = [first];
  while (active.length) {
    const at =
      rnd() < NEWEST_SHARE
        ? active.length - 1
        : Math.floor(rnd() * active.length);
    const c = active[at]!;
    const free = MAZE_DIRS.filter((d) => {
      const n = neighbor(size, c, d);
      return n !== null && !seen[n];
    });
    if (!free.length) {
      active.splice(at, 1);
      continue;
    }
    const d = pick(free);
    const n = neighbor(size, c, d)!;
    carve(c, d, n);
    seen[n] = 1;
    active.push(n);
  }

  // Петли: часть тупиков пробиваем в закрытого соседа — лучше в такой же
  // тупик, тогда пропадают сразу два.
  const deadEnds = cells
    .map((bits, i) => (openCount(bits) === 1 ? i : -1))
    .filter((i) => i >= 0);
  for (let i = deadEnds.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deadEnds[i], deadEnds[j]] = [deadEnds[j]!, deadEnds[i]!];
  }
  const braids = Math.round(deadEnds.length * BRAID_SHARE);
  let done = 0;
  for (const c of deadEnds) {
    if (done >= braids) break;
    if (openCount(cells[c]!) !== 1) continue; // уже пробит соседом
    const closed = MAZE_DIRS.filter(
      (d) => !isOpen(cells[c]!, d) && neighbor(size, c, d) !== null,
    );
    if (!closed.length) continue;
    const dead = closed.filter(
      (d) => openCount(cells[neighbor(size, c, d)!]!) === 1,
    );
    const d = pick(dead.length ? dead : closed);
    carve(c, d, neighbor(size, c, d)!);
    done++;
  }

  return { size, cells, start: 0, exit: total - 1 };
}

// ── Повороты ─────────────────────────────────────────────────────────────

/** Сколько вариантов поворота: четыре поворота на 90° и они же в зеркале. */
export const MAZE_TRANSFORMS = 8;

const ROTATE_CW: Record<MazeDir, MazeDir> = { U: "R", R: "D", D: "L", L: "U" };
const MIRROR: Record<MazeDir, MazeDir> = { U: "U", R: "L", D: "D", L: "R" };

/** Куда уходит сторона при повороте t: сначала t % 4 раз по часовой, потом
 *  зеркало слева направо, если t ≥ 4. */
export function transformDir(t: number, d: MazeDir): MazeDir {
  let r = d;
  for (let k = 0; k < t % 4; k++) r = ROTATE_CW[r];
  return t >= 4 ? MIRROR[r] : r;
}

export function transformCell(size: number, t: number, i: number): number {
  let x = i % size;
  let y = Math.floor(i / size);
  for (let k = 0; k < t % 4; k++) [x, y] = [size - 1 - y, x];
  if (t >= 4) x = size - 1 - x;
  return y * size + x;
}

/** Лабиринт таким, каким его видит игрок с поворотом t. */
export function transformMaze(maze: Maze, t: number): Maze {
  const { size } = maze;
  const cells = new Array<number>(size * size).fill(0);
  maze.cells.forEach((bits, i) => {
    let out = 0;
    for (const d of MAZE_DIRS)
      if (isOpen(bits, d)) out |= DIR_BIT[transformDir(t, d)];
    cells[transformCell(size, t, i)] = out;
  });
  return {
    size,
    cells,
    start: transformCell(size, t, maze.start),
    exit: transformCell(size, t, maze.exit),
  };
}

// ── Путь и видимость ─────────────────────────────────────────────────────

/** Клетки, центр которых не дальше r от точки (x, y) — точка в клетках,
 *  может быть и между ними, пока фишка едет. */
export function cellsNear(
  size: number,
  x: number,
  y: number,
  r: number,
): number[] {
  const out: number[] = [];
  const x0 = Math.max(0, Math.ceil(x - r));
  const x1 = Math.min(size - 1, Math.floor(x + r));
  const y0 = Math.max(0, Math.ceil(y - r));
  const y1 = Math.min(size - 1, Math.floor(y + r));
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++)
      if ((cx - x) ** 2 + (cy - y) ** 2 <= r * r) out.push(cy * size + cx);
  return out;
}

/** Клетки в радиусе r вокруг каждой из пройденных. */
export function cellsAround(
  size: number,
  path: readonly number[],
  r: number,
): Set<number> {
  const out = new Set<number>();
  for (const p of new Set(path))
    for (const c of cellsNear(size, p % size, Math.floor(p / size), r))
      out.add(c);
  return out;
}

export type MazeWalk =
  | { ok: true; path: number[]; finished: boolean; used: number }
  | { ok: false; path: number[]; badAt: number };

/**
 * Пройти ходы от клетки from. path — все клетки по дороге, первая — from.
 * Через стену хода нет: такой забег не принимается. До выхода дошли —
 * дальше ходы не считаются (used — сколько их пошло в дело).
 */
export function walk(maze: Maze, moves: string, from = maze.start): MazeWalk {
  const path = [from];
  let at = from;
  for (let k = 0; k < moves.length; k++) {
    if (at === maze.exit) return { ok: true, path, finished: true, used: k };
    const d = moves[k];
    if (!isMazeDir(d) || !isOpen(maze.cells[at]!, d))
      return { ok: false, path, badAt: k };
    at = neighbor(maze.size, at, d)!;
    path.push(at);
  }
  return { ok: true, path, finished: at === maze.exit, used: moves.length };
}

// ── То, что видит страница ───────────────────────────────────────────────

/** Известная клетка: номер и проходы. */
export type MazeCell = [index: number, bits: number];

/** Забег глазами игрока — уже в его повороте. */
export type MazeRunView = {
  id: number;
  /** Забег дня турнира или тренировка. */
  kind: "round" | "practice";
  size: number;
  start: number;
  exit: number;
  /** Сделанные ходы — по ним страница восстанавливает путь после перезагрузки. */
  moves: string;
  /** Клетки, которые сервер уже открыл. */
  cells: MazeCell[];
  /** Сколько прошло от старта — или сколько занял забег, если он окончен. */
  elapsedMs: number;
  finishedMs: number | null;
};

/** Страница лабиринта. */
export type MazeState = {
  mode: MazeMode;
  /** Вошедший; гостю — null. */
  me: {
    /** Команда в показанном турнире; не вступал — null. */
    team: MazeTeam | null;
    /** Можно ли вступать и проходить: зависит от режима ивента. */
    canPlay: boolean;
    isAdmin: boolean;
  } | null;
  /** Идущий турнир или последний окончившийся. Турниров не было — null. */
  tournament: MazeTournamentView | null;
  /** Свой забег сегодняшнего дня турнира. */
  run: MazeRunView | null;
  /** Последняя тренировка — только у админа. */
  practice: MazeRunView | null;
  practiceSizes: readonly number[];
};

export type MazeMoveResult = {
  /** Клетки, которые открыли эти ходы. */
  cells: MazeCell[];
  elapsedMs: number;
  finishedMs: number | null;
};

/** 83 456 мс → «1:23.45». Итоги — до сотых: два забега в один день бывает
 *  трудно различить по десятым, а очко получает только один. Бегущий таймер —
 *  до десятых (digits = 1): сотые на ходу только мельтешат. */
export function formatMazeTime(ms: number, digits: 1 | 2 = 2): string {
  const unit = digits === 2 ? 10 : 100;
  const parts = Math.floor(Math.max(0, ms) / unit);
  const perSecond = 1000 / unit;
  const m = Math.floor(parts / (60 * perSecond));
  const s = Math.floor((parts % (60 * perSecond)) / perSecond);
  const frac = String(parts % perSecond).padStart(digits, "0");
  return `${m}:${String(s).padStart(2, "0")}.${frac}`;
}
