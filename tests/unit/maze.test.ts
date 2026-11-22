import { describe, expect, it } from "vitest";
import type { Maze, MazeDir } from "../../shared/utils/maze";
import {
  DIR_BIT,
  MAZE_DIRS,
  MAZE_TRANSFORMS,
  OPPOSITE,
  cellsAround,
  cellsNear,
  corridorNext,
  formatMazeTime,
  generateMaze,
  isOpen,
  neighbor,
  transformDir,
  transformMaze,
  walk,
} from "../../shared/utils/maze";

/** Кратчайший путь от входа до выхода — ходами. */
function shortest(m: Maze): string {
  const from = new Map<number, [number, MazeDir]>();
  const queue = [m.start];
  const seen = new Set(queue);
  while (queue.length) {
    const c = queue.shift()!;
    if (c === m.exit) break;
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

function reachable(m: Maze): number {
  const seen = new Set([m.start]);
  const queue = [m.start];
  while (queue.length) {
    const c = queue.shift()!;
    for (const d of MAZE_DIRS) {
      if (!isOpen(m.cells[c]!, d)) continue;
      const n = neighbor(m.size, c, d)!;
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size;
}

describe("лабиринт: генерация", () => {
  it("один сид — один лабиринт, другой сид — другой", () => {
    expect(generateMaze("день", 15)).toEqual(generateMaze("день", 15));
    expect(generateMaze("день", 15).cells).not.toEqual(
      generateMaze("ночь", 15).cells,
    );
  });

  it.each([9, 15, 25])(
    "%i×%i: все клетки связаны, стены с двух сторон",
    (size) => {
      for (const seed of ["a", "b", "c", "d"]) {
        const m = generateMaze(seed, size);
        expect(m.cells).toHaveLength(size * size);
        expect(reachable(m)).toBe(size * size);
        m.cells.forEach((bits, i) => {
          for (const d of MAZE_DIRS) {
            if (!isOpen(bits, d)) continue;
            const n = neighbor(size, i, d);
            // Прохода за край нет, а проход в соседа открыт и с его стороны.
            expect(n).not.toBeNull();
            expect(isOpen(m.cells[n!]!, OPPOSITE[d])).toBe(true);
          }
        });
      }
    },
  );

  it("вход и выход — в противоположных углах, путь между ними длинный", () => {
    const m = generateMaze("угол", 15);
    expect(m.start).toBe(0);
    expect(m.exit).toBe(15 * 15 - 1);
    // Напрямую по углам — 28 ходов; лабиринт должен уводить в сторону.
    expect(shortest(m).length).toBeGreaterThan(28);
  });
});

describe("лабиринт: повороты", () => {
  const base = generateMaze("поворот", 13);

  it("без поворота лабиринт тот же", () => {
    expect(transformMaze(base, 0)).toEqual(base);
  });

  it("восемь поворотов — восемь разных картинок одного лабиринта", () => {
    const views = Array.from({ length: MAZE_TRANSFORMS }, (_, t) =>
      transformMaze(base, t),
    );
    expect(new Set(views.map((v) => v.cells.join())).size).toBe(8);
    for (const v of views) {
      expect(reachable(v)).toBe(13 * 13);
      // Длина пути у всех одна — сложность не меняется.
      expect(shortest(v).length).toBe(shortest(base).length);
    }
  });

  it("ходы поворачиваются вместе с лабиринтом", () => {
    const route = shortest(base);
    for (let t = 0; t < MAZE_TRANSFORMS; t++) {
      const view = transformMaze(base, t);
      const turned = [...route]
        .map((d) => transformDir(t, d as MazeDir))
        .join("");
      const res = walk(view, turned);
      expect(res.ok && res.finished).toBe(true);
    }
  });

  it("у разных поворотов первый ход разный", () => {
    // Подсказка «сначала направо» у соседа не работает.
    const first = new Set(
      Array.from({ length: MAZE_TRANSFORMS }, (_, t) =>
        transformDir(t, shortest(base)[0] as MazeDir),
      ),
    );
    expect(first.size).toBe(4);
  });
});

describe("лабиринт: ходы", () => {
  const m = generateMaze("ходы", 11);

  it("сквозь стену не пройти", () => {
    const wall = MAZE_DIRS.find((d) => !isOpen(m.cells[m.start]!, d))!;
    const res = walk(m, wall);
    expect(res.ok).toBe(false);
  });

  it("мусор вместо хода не принимается", () => {
    expect(walk(m, "X").ok).toBe(false);
  });

  it("после выхода ходы не считаются", () => {
    const route = shortest(m);
    const res = walk(m, route + OPPOSITE[route.at(-1) as MazeDir]);
    expect(res.ok && res.finished).toBe(true);
    if (res.ok) expect(res.used).toBe(route.length);
  });

  it("в коридоре фишка поворачивает сама, на развилке встаёт", () => {
    // Коридор вниз и направо: пришли сверху — едем направо.
    expect(corridorNext(DIR_BIT.U | DIR_BIT.R, "D")).toBe("R");
    // Прямой коридор.
    expect(corridorNext(DIR_BIT.L | DIR_BIT.R, "R")).toBe("R");
    // Развилка и тупик.
    expect(corridorNext(DIR_BIT.U | DIR_BIT.R | DIR_BIT.D, "D")).toBeNull();
    expect(corridorNext(DIR_BIT.U, "D")).toBeNull();
  });
});

describe("лабиринт: видимость", () => {
  it("фонарь светит кругом, а не квадратом", () => {
    // Радиус 2.3: крест до двух клеток и диагональ (2,1), но не угол (2,2).
    expect(cellsNear(11, 5, 5, 2.3)).toHaveLength(21);
    expect(cellsNear(11, 5, 5, 2.3)).not.toContain(3 * 11 + 3);
  });

  it("у края лишнего нет", () => {
    expect(cellsNear(11, 0, 0, 2.3).every((c) => c >= 0 && c < 121)).toBe(true);
    expect(cellsNear(11, 0, 0, 2.3)).toHaveLength(8);
  });

  it("вокруг пути — объединение кругов", () => {
    const around = cellsAround(11, [0, 1, 2], 1);
    expect([...around].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 11, 12, 13]);
  });
});

describe("лабиринт: время", () => {
  it.each([
    [0, "0:00.00"],
    [34_267, "0:34.26"],
    [83_456, "1:23.45"],
    [600_000, "10:00.00"],
  ])("итог: %i мс → %s", (ms, text) => {
    expect(formatMazeTime(ms)).toBe(text);
  });

  it.each([
    [34_267, "0:34.2"],
    [83_456, "1:23.4"],
  ])("бегущий таймер: %i мс → %s", (ms, text) => {
    expect(formatMazeTime(ms, 1)).toBe(text);
  });
});
