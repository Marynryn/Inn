import { randomBytes, randomInt } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
} from "drizzle-orm";
import type {
  MazeBanner,
  MazeBest,
  MazeDayResult,
  MazeMember,
  MazeMode,
  MazeTeam,
  MazeTournamentView,
} from "#shared/utils/mazeTournament";
import {
  MAZE_TOURNAMENT_DAYS,
  dayLeader,
  mazeAnnouncedTo,
  mazeModeOf,
  mazeSizesOf,
  pickTeam,
  tournamentScore,
} from "#shared/utils/mazeTournament";
import {
  mazeMembers,
  mazeRounds,
  mazeRuns,
  mazeTournaments,
  siteSettings,
  users,
} from "../database/schema";
import { useDb } from "./db";
import { readerName } from "./identity";
import { mskDay } from "./msk";

/**
 * Турниры лабиринта на сервере: смена дней, вступление, итоги.
 *
 * Отдельной задачи в полночь нет: день закрывается при первом обращении после
 * полуночи (settle) — с той полуночью как временем закрытия. Пропустили
 * несколько дней — закрываются все по порядку.
 */

type TournamentRow = typeof mazeTournaments.$inferSelect;
type RoundRow = typeof mazeRounds.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;
const newSeed = () => randomBytes(16).toString("hex");

/** Полночь по Москве после дня day — в мс. */
export const midnightAfter = (day: string) =>
  Date.parse(`${day}T00:00:00+03:00`) + DAY_MS;

export type MazeSettings = { mode: MazeMode; sizes: number[] };

/** Режим и размеры — из общих настроек сайта, их правит вкладка «Лабиринт». */
export async function mazeSettings(): Promise<MazeSettings> {
  const rows = await useDb()
    .select()
    .from(siteSettings)
    .where(inArray(siteSettings.key, ["maze_mode", "maze_sizes"]));
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { mode: mazeModeOf(s.maze_mode), sizes: mazeSizesOf(s.maze_sizes) };
}

export async function latestTournament(): Promise<TournamentRow | null> {
  const [t] = await useDb()
    .select()
    .from(mazeTournaments)
    .orderBy(desc(mazeTournaments.id))
    .limit(1);
  return t ?? null;
}

async function roundsOf(tournamentId: number): Promise<RoundRow[]> {
  return useDb()
    .select()
    .from(mazeRounds)
    .where(eq(mazeRounds.tournamentId, tournamentId))
    .orderBy(asc(mazeRounds.round));
}

/** Идущий день турнира — или null, если турнир окончен. */
export async function openRound(t: TournamentRow): Promise<RoundRow | null> {
  if (t.finishedAt !== null) return null;
  const [r] = await useDb()
    .select()
    .from(mazeRounds)
    .where(and(eq(mazeRounds.tournamentId, t.id), isNull(mazeRounds.closedAt)))
    .orderBy(desc(mazeRounds.round))
    .limit(1);
  return r ?? null;
}

/**
 * Последний турнир, доведённый до сегодняшнего дня. День, чьё число прошло,
 * закрывается полуночью после него, и заводится следующий — на тот день, когда
 * закрылся прошлый: после полуночи это следующий день, после кнопки админа —
 * тот же. Закрылся последний день — закончился турнир.
 *
 * Два запроса разом не заведут день дважды: номер дня держит уникальный
 * индекс, закрытие пишется только туда, где его ещё нет.
 */
export async function settle(now = Date.now()): Promise<TournamentRow | null> {
  const db = useDb();
  const t = await latestTournament();
  if (!t || t.finishedAt !== null) return t;
  const today = mskDay(now);
  const { sizes } = await mazeSettings();

  for (let guard = 0; guard <= t.days * 2; guard++) {
    const [last] = await db
      .select()
      .from(mazeRounds)
      .where(eq(mazeRounds.tournamentId, t.id))
      .orderBy(desc(mazeRounds.round))
      .limit(1);
    if (!last) return t;

    let closedAt = last.closedAt;
    if (closedAt === null) {
      if (last.day >= today) return t;
      closedAt = midnightAfter(last.day);
      await db
        .update(mazeRounds)
        .set({ closedAt })
        .where(and(eq(mazeRounds.id, last.id), isNull(mazeRounds.closedAt)));
    }

    if (last.round >= t.days) {
      await db
        .update(mazeTournaments)
        .set({ finishedAt: closedAt })
        .where(
          and(eq(mazeTournaments.id, t.id), isNull(mazeTournaments.finishedAt)),
        );
      return (await latestTournament())!;
    }

    await db
      .insert(mazeRounds)
      .values({
        tournamentId: t.id,
        round: last.round + 1,
        day: mskDay(closedAt),
        seed: newSeed(),
        size: sizes[last.round] ?? sizes.at(-1)!,
      })
      .onConflictDoNothing();
  }
  return t;
}

/** Начать турнир: первый день — сегодня. Пока идёт прошлый — нельзя. */
export async function startTournament(now = Date.now()) {
  const t = await settle(now);
  if (t && t.finishedAt === null)
    throw createError({ statusCode: 409, message: "Турнир уже идёт" });
  const db = useDb();
  const { sizes } = await mazeSettings();
  const [made] = await db
    .insert(mazeTournaments)
    .values({ days: MAZE_TOURNAMENT_DAYS })
    .returning();
  await db.insert(mazeRounds).values({
    tournamentId: made!.id,
    round: 1,
    day: mskDay(now),
    seed: newSeed(),
    size: sizes[0]!,
  });
  return made!;
}

/**
 * Закончить день сейчас, не дожидаясь полуночи, — для проверки турнира
 * админами. Итоги дня подводятся этой минутой, следующий день начинается
 * сразу; закончился последний — закончился турнир.
 */
export async function advanceDay(now = Date.now()) {
  const t = await settle(now);
  const r = t ? await openRound(t) : null;
  if (!t || !r)
    throw createError({ statusCode: 409, message: "Турнир сейчас не идёт" });
  await useDb()
    .update(mazeRounds)
    .set({ closedAt: now })
    .where(and(eq(mazeRounds.id, r.id), isNull(mazeRounds.closedAt)));
  return settle(now);
}

/** Удалить турнир целиком: дни, составы, забеги. Для уборки после пробы. */
export async function deleteTournament(id: number) {
  const db = useDb();
  const ids = (await roundsOf(id)).map((r) => r.id);
  if (ids.length)
    await db
      .delete(mazeRuns)
      .where(and(eq(mazeRuns.kind, "round"), inArray(mazeRuns.roundId, ids)));
  await db.delete(mazeRounds).where(eq(mazeRounds.tournamentId, id));
  await db.delete(mazeMembers).where(eq(mazeMembers.tournamentId, id));
  const gone = await db
    .delete(mazeTournaments)
    .where(eq(mazeTournaments.id, id))
    .returning({ id: mazeTournaments.id });
  if (!gone.length)
    throw createError({ statusCode: 404, message: "Турнира нет" });
}

export async function memberTeam(
  tournamentId: number,
  userId: number,
): Promise<MazeTeam | null> {
  const [m] = await useDb()
    .select({ team: mazeMembers.team })
    .from(mazeMembers)
    .where(
      and(
        eq(mazeMembers.tournamentId, tournamentId),
        eq(mazeMembers.userId, userId),
      ),
    );
  return m?.team ?? null;
}

/**
 * Вступить в идущий турнир. Команда — на весь турнир: поровну — монеткой,
 * иначе туда, где людей меньше. Вступивший раньше получает свою же команду.
 */
export async function joinTournament(
  userId: number,
  now = Date.now(),
): Promise<MazeTeam> {
  const t = await settle(now);
  if (!t || !(await openRound(t)))
    throw createError({ statusCode: 409, message: "Турнир сейчас не идёт" });
  const had = await memberTeam(t.id, userId);
  if (had) return had;

  const db = useDb();
  const rows = await db
    .select({ team: mazeMembers.team, n: count() })
    .from(mazeMembers)
    .where(eq(mazeMembers.tournamentId, t.id))
    .groupBy(mazeMembers.team);
  const counts: Record<MazeTeam, number> = { goblins: 0, antinium: 0 };
  for (const r of rows) counts[r.team] = r.n;
  const team = pickTeam(counts, () => randomInt(1_000_000) / 1_000_000);

  await db
    .insert(mazeMembers)
    .values({ tournamentId: t.id, userId, team })
    .onConflictDoNothing();
  return (await memberTeam(t.id, userId))!;
}

/** Итоги по дням: лучший забег каждой команды. У закрытого дня считаются
 *  только забеги, законченные до закрытия. */
export async function dayResults(t: TournamentRow): Promise<MazeDayResult[]> {
  const rounds = await roundsOf(t.id);
  if (!rounds.length) return [];
  const rows = await useDb()
    .select({
      roundId: mazeRuns.roundId,
      startedAt: mazeRuns.startedAt,
      finishedAt: mazeRuns.finishedAt,
      team: mazeMembers.team,
      displayName: users.displayName,
      email: users.email,
      code: users.publicId,
    })
    .from(mazeRuns)
    .innerJoin(
      mazeMembers,
      and(
        eq(mazeMembers.tournamentId, t.id),
        eq(mazeMembers.userId, mazeRuns.userId),
      ),
    )
    .innerJoin(users, eq(users.id, mazeRuns.userId))
    .where(
      and(
        eq(mazeRuns.kind, "round"),
        inArray(
          mazeRuns.roundId,
          rounds.map((r) => r.id),
        ),
        isNotNull(mazeRuns.finishedAt),
      ),
    );

  return rounds.map((r) => {
    const best: Partial<Record<MazeTeam, MazeBest>> = {};
    for (const row of rows) {
      if (row.roundId !== r.id) continue;
      if (r.closedAt !== null && row.finishedAt! > r.closedAt) continue;
      const ms = row.finishedAt! - row.startedAt;
      const was = best[row.team];
      if (!was || ms < was.ms)
        best[row.team] = { ms, name: readerName(row), code: row.code };
    }
    return {
      round: r.round,
      size: r.size,
      day: r.day,
      closed: r.closedAt !== null,
      best,
      leader: dayLeader(best),
    };
  });
}

async function rosters(
  tournamentId: number,
): Promise<Record<MazeTeam, MazeMember[]>> {
  const rows = await useDb()
    .select({
      team: mazeMembers.team,
      displayName: users.displayName,
      email: users.email,
      code: users.publicId,
    })
    .from(mazeMembers)
    .innerJoin(users, eq(users.id, mazeMembers.userId))
    .where(eq(mazeMembers.tournamentId, tournamentId))
    .orderBy(asc(mazeMembers.createdAt));
  const out: Record<MazeTeam, MazeMember[]> = { goblins: [], antinium: [] };
  for (const r of rows) out[r.team].push({ name: readerName(r), code: r.code });
  return out;
}

/** Номер турнира по счёту: удалённые пробные не считаются. */
async function numberOf(t: TournamentRow): Promise<number> {
  const [row] = await useDb()
    .select({ n: count() })
    .from(mazeTournaments)
    .where(lte(mazeTournaments.id, t.id));
  return row?.n ?? 1;
}

export async function tournamentView(
  t: TournamentRow,
): Promise<MazeTournamentView> {
  const results = await dayResults(t);
  const open = await openRound(t);
  const { sizes } = await mazeSettings();
  return {
    id: t.id,
    number: await numberOf(t),
    days: t.days,
    round: open?.round ?? null,
    finished: t.finishedAt !== null,
    teams: await rosters(t.id),
    results,
    score: tournamentScore(results),
    nextSize:
      open && open.round < t.days ? (sizes[open.round] ?? sizes.at(-1)!) : null,
    sizes: Array.from(
      { length: t.days },
      (_, i) => results[i]?.size ?? sizes[i] ?? sizes.at(-1)!,
    ),
  };
}

/** Плашка на главной и пункт меню: null — этому человеку ивента не видно. */
export async function mazeBanner(
  role: string | undefined,
  now = Date.now(),
): Promise<MazeBanner | null> {
  const { mode } = await mazeSettings();
  if (!mazeAnnouncedTo(mode, role)) return null;
  const t = await settle(now);
  if (!t) return { tournament: null };
  const results = await dayResults(t);
  const score = tournamentScore(results);
  const today = results.find((d) => !d.closed);
  const todayLeader = today?.leader ?? null;
  return {
    tournament: {
      number: await numberOf(t),
      round: today?.round ?? null,
      days: t.days,
      finished: t.finishedAt !== null,
      points: score.points,
      leader: score.leader,
      today:
        todayLeader && today
          ? { team: todayLeader, ms: today.best[todayLeader]!.ms }
          : null,
    },
  };
}
