import { describe, expect, it } from "vitest";
import type { MazeDayResult } from "../../shared/utils/mazeTournament";
import {
  MAZE_SIZES_DEFAULT,
  dayLeader,
  mazeAnnouncedTo,
  mazePlayableBy,
  mazeSizesOf,
  mazeVisibleTo,
  pickTeam,
  tournamentScore,
} from "../../shared/utils/mazeTournament";

const day = (
  round: number,
  g: number | undefined,
  a: number | undefined,
  closed = true,
): MazeDayResult => {
  const best: MazeDayResult["best"] = {};
  if (g !== undefined) best.goblins = { ms: g, name: "g", code: null };
  if (a !== undefined) best.antinium = { ms: a, name: "a", code: null };
  return {
    round,
    size: 11,
    day: "2026-12-01",
    closed,
    best,
    leader: dayLeader(best),
  };
};

describe("турнир: команды", () => {
  it("поровну — решает монетка", () => {
    expect(pickTeam({ goblins: 2, antinium: 2 }, () => 0.1)).toBe("goblins");
    expect(pickTeam({ goblins: 2, antinium: 2 }, () => 0.9)).toBe("antinium");
  });

  it("неровно — в меньшую команду, монетка не важна", () => {
    expect(pickTeam({ goblins: 3, antinium: 2 }, () => 0.1)).toBe("antinium");
    expect(pickTeam({ goblins: 1, antinium: 4 }, () => 0.9)).toBe("goblins");
  });

  it("восемь вступивших подряд делятся четыре на четыре", () => {
    const counts = { goblins: 0, antinium: 0 };
    for (let i = 0; i < 8; i++) counts[pickTeam(counts, Math.random)]++;
    expect(counts).toEqual({ goblins: 4, antinium: 4 });
  });
});

describe("турнир: день", () => {
  it("очко — у команды с лучшим временем, сколько бы в ней ни играло", () => {
    expect(
      dayLeader({ goblins: { ms: 30_000 }, antinium: { ms: 35_000 } }),
    ).toBe("goblins");
  });

  it("прошла одна команда — очко ей, никто — никому", () => {
    expect(dayLeader({ antinium: { ms: 90_000 } })).toBe("antinium");
    expect(dayLeader({})).toBeNull();
  });

  it("одинаковое время до миллисекунды — никому", () => {
    expect(dayLeader({ goblins: { ms: 1 }, antinium: { ms: 1 } })).toBeNull();
  });
});

describe("турнир: счёт", () => {
  it("очки дают только подведённые дни", () => {
    const s = tournamentScore([day(1, 30, 40), day(2, 50, 20, false)]);
    expect(s.points).toEqual({ goblins: 1, antinium: 0 });
    expect(s.leader).toBe("goblins");
  });

  it("больше очков — победа", () => {
    const s = tournamentScore([
      day(1, 30, 40),
      day(2, 50, 20),
      day(3, 10, 20),
      day(4, undefined, 20),
      day(5, undefined, undefined),
    ]);
    expect(s.points).toEqual({ goblins: 2, antinium: 2 });
    // Равно по очкам: сумма времён за дни, где прошли обе, — 90 против 80.
    expect(s.leader).toBe("antinium");
    expect(s.byTime).toBe(true);
  });

  it("равно и по времени — ничья", () => {
    const s = tournamentScore([day(1, 30, 40), day(2, 40, 30)]);
    expect(s.leader).toBeNull();
    expect(s.byTime).toBe(false);
  });
});

describe("турнир: размеры и режим", () => {
  it("размеры из настройки, а неверные — по умолчанию", () => {
    expect(mazeSizesOf("9, 11, 13, 15, 17")).toEqual([9, 11, 13, 15, 17]);
    expect(mazeSizesOf("9 11")).toEqual([9, 11, 11, 11, 11]);
    expect(mazeSizesOf("9,100")).toEqual([...MAZE_SIZES_DEFAULT]);
    expect(mazeSizesOf(undefined)).toEqual([...MAZE_SIZES_DEFAULT]);
  });

  it("проба для админов: читатель не видит и не играет", () => {
    expect(mazeVisibleTo("admins", "reader")).toBe(false);
    expect(mazePlayableBy("admins", "reader")).toBe(false);
    expect(mazeAnnouncedTo("admins", "reader")).toBe(false);
    expect(mazePlayableBy("admins", "admin")).toBe(true);
    expect(mazeAnnouncedTo("admins", "admin")).toBe(true);
  });

  it("идёт — играют все вошедшие; закончен — смотрят, но не играют", () => {
    expect(mazePlayableBy("on", "reader")).toBe(true);
    expect(mazeVisibleTo("on", undefined)).toBe(true);
    expect(mazeVisibleTo("ended", undefined)).toBe(true);
    expect(mazePlayableBy("ended", "admin")).toBe(false);
  });

  it("выключен — страница только у админа, без плашки", () => {
    expect(mazeVisibleTo("off", "admin")).toBe(true);
    expect(mazeVisibleTo("off", "reader")).toBe(false);
    expect(mazeAnnouncedTo("off", "admin")).toBe(false);
  });
});
