/**
 * Турниры лабиринта: команды, режим ивента и подсчёт очков — то, что нужно и
 * серверу, и странице.
 *
 * Турнир — пять дней, каждый день новый лабиринт, к концу крупнее. В турнир
 * вступают заново, и команда назначается на весь турнир: если в командах
 * поровну — монеткой, иначе в ту, где людей меньше.
 *
 * День выигрывает команда, у которой лучшее время дня: ей очко. Прошла одна
 * команда — очко ей, никто — очка нет. Итоги дня — в полночь по Москве. Равный
 * счёт в конце решает сумма лучших времён за дни, где прошли обе команды:
 * у кого меньше, та и победила.
 */

export type MazeTeam = "goblins" | "antinium";
export const MAZE_TEAM_IDS: readonly MazeTeam[] = ["goblins", "antinium"];

export const MAZE_TEAMS: Record<
  MazeTeam,
  { name: string; of: string; color: string }
> = {
  goblins: { name: "Гоблины", of: "Гоблинов", color: "#8fb07a" },
  antinium: { name: "Антиниумы", of: "Антиниумов", color: "#e0a84f" },
};

export const isMazeTeam = (v: unknown): v is MazeTeam =>
  v === "goblins" || v === "antinium";

/** Сколько дней в турнире. */
export const MAZE_TOURNAMENT_DAYS = 5;

/** Размеры лабиринта по дням турнира, если в админке не задано своих. */
export const MAZE_SIZES_DEFAULT = [11, 13, 15, 17, 19] as const;
export const MAZE_SIZE_MIN = 7;
export const MAZE_SIZE_MAX = 31;

/** Размеры из настройки «11,13,15,17,19». Чего нет или не так — по
 *  умолчанию; не хватает дней — последний размер повторяется. */
export function mazeSizesOf(raw: unknown): number[] {
  const parsed =
    typeof raw === "string"
      ? raw
          .split(/[,\s]+/)
          .filter(Boolean)
          .map(Number)
      : [];
  const ok =
    parsed.length > 0 &&
    parsed.every(
      (n) => Number.isInteger(n) && n >= MAZE_SIZE_MIN && n <= MAZE_SIZE_MAX,
    );
  const sizes = ok ? parsed : [...MAZE_SIZES_DEFAULT];
  return Array.from(
    { length: MAZE_TOURNAMENT_DAYS },
    (_, i) => sizes[Math.min(i, sizes.length - 1)]!,
  );
}

/**
 * Режим ивента, как у ёлки:
 *  off    — выключен: страница только у админов (тренировка, пульт);
 *  admins — проба на проде: играют, видят плашку и пункт меню только админы;
 *  on     — идёт: играют все вошедшие, смотрят и гости;
 *  ended  — закончен: итоги видны всем, играть нельзя.
 */
export type MazeMode = "off" | "admins" | "on" | "ended";

export const MAZE_MODES: { value: MazeMode; label: string }[] = [
  { value: "off", label: "Выключен" },
  { value: "admins", label: "Только для админов" },
  { value: "on", label: "Идёт — для всех" },
  { value: "ended", label: "Ивент закончен — итоги видны" },
];

export const mazeModeOf = (v: unknown): MazeMode =>
  v === "admins" || v === "on" || v === "ended" ? v : "off";

/** Видна ли страница лабиринта. */
export const mazeVisibleTo = (mode: MazeMode, role: string | undefined) =>
  mode === "on" || mode === "ended" || role === "admin";

/** Можно ли вступать и проходить лабиринт дня. */
export const mazePlayableBy = (mode: MazeMode, role: string | undefined) =>
  mode === "on" || (mode === "admins" && role === "admin");

/** Видна ли плашка на главной и пункт в меню. */
export const mazeAnnouncedTo = (mode: MazeMode, role: string | undefined) =>
  mode === "on" || mode === "ended" || (mode === "admins" && role === "admin");

/** Команда новичка: поровну — монетка (coin — число в [0, 1)), иначе туда,
 *  где людей меньше. */
export function pickTeam(
  counts: Record<MazeTeam, number>,
  coin: () => number,
): MazeTeam {
  if (counts.goblins < counts.antinium) return "goblins";
  if (counts.antinium < counts.goblins) return "antinium";
  return coin() < 0.5 ? "goblins" : "antinium";
}

/** Лучший забег команды за день. */
export type MazeBest = {
  ms: number;
  name: string;
  /** Код страницы читателя — имя ведёт на неё; нет кода — просто подпись. */
  code: string | null;
};

export type MazeDayResult = {
  round: number;
  size: number;
  /** День по Москве, когда шёл этот день турнира. */
  day: string;
  /** Итоги подведены: день закончился. Иначе это сегодняшний день. */
  closed: boolean;
  best: Partial<Record<MazeTeam, MazeBest>>;
  /** Чья команда быстрее — у открытого дня это «кто ведёт». */
  leader: MazeTeam | null;
};

/** Кто быстрее за день. Одинаковое время до миллисекунды — никто. */
export function dayLeader(
  best: Partial<Record<MazeTeam, { ms: number }>>,
): MazeTeam | null {
  const g = best.goblins?.ms;
  const a = best.antinium?.ms;
  if (g === undefined && a === undefined) return null;
  if (a === undefined) return "goblins";
  if (g === undefined) return "antinium";
  if (g === a) return null;
  return g < a ? "goblins" : "antinium";
}

export type MazeScore = {
  /** Очки за подведённые дни. */
  points: Record<MazeTeam, number>;
  /** Кто впереди сейчас (или победил, если турнир окончен). null — поровну. */
  leader: MazeTeam | null;
  /** При равных очках решила сумма лучших времён. */
  byTime: boolean;
};

/** Счёт турнира по дням. Очко дают только подведённые дни: сегодняшний ещё
 *  может перемениться. */
export function tournamentScore(days: readonly MazeDayResult[]): MazeScore {
  const points: Record<MazeTeam, number> = { goblins: 0, antinium: 0 };
  const sums: Record<MazeTeam, number> = { goblins: 0, antinium: 0 };
  let both = 0;
  for (const d of days) {
    if (!d.closed) continue;
    if (d.leader) points[d.leader]++;
    const g = d.best.goblins?.ms;
    const a = d.best.antinium?.ms;
    if (g !== undefined && a !== undefined) {
      sums.goblins += g;
      sums.antinium += a;
      both++;
    }
  }
  if (points.goblins !== points.antinium)
    return {
      points,
      leader: points.goblins > points.antinium ? "goblins" : "antinium",
      byTime: false,
    };
  if (both && sums.goblins !== sums.antinium)
    return {
      points,
      leader: sums.goblins < sums.antinium ? "goblins" : "antinium",
      byTime: true,
    };
  return { points, leader: null, byTime: false };
}

/** Участник для состава команды. */
export type MazeMember = { name: string; code: string | null };

/** Турнир глазами страницы. */
export type MazeTournamentView = {
  id: number;
  /** Номер по счёту — «Турнир №2». */
  number: number;
  days: number;
  /** Идущий день; турнир окончен — null. */
  round: number | null;
  finished: boolean;
  teams: Record<MazeTeam, MazeMember[]>;
  results: MazeDayResult[];
  score: MazeScore;
  /** Размер лабиринта следующего дня — «завтра 17×17». */
  nextSize: number | null;
  /** Размеры по всем дням: у прошедших — какими были, у будущих — по плану. */
  sizes: number[];
};

/** Плашка на главной и пункт в меню. Турнира нет — плашка зовёт ждать
 *  следующего. */
export type MazeBanner = {
  tournament: {
    number: number;
    round: number | null;
    days: number;
    finished: boolean;
    points: Record<MazeTeam, number>;
    leader: MazeTeam | null;
    /** Кто ведёт сегодня и с каким временем. */
    today: { team: MazeTeam; ms: number } | null;
  } | null;
};
