import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import type { Page } from "@playwright/test";
import { test, expect, login, open } from "./helpers";
import { ADMIN, READER } from "./fixtures";
import type { Maze, MazeDir } from "../../shared/utils/maze";
import {
  MAZE_DIRS,
  corridorNext,
  generateMaze,
  isOpen,
  neighbor,
  transformMaze,
} from "../../shared/utils/maze";

/**
 * Лабиринт — пока проба для админов. Лабиринт знает только сервер, поэтому
 * сценарий подсматривает его в базе тестового сервера (сид и поворот забега)
 * и проходит по кратчайшему пути клавишами, как игрок.
 */

const testDb = () =>
  createClient({ url: `file:${resolve(".data/e2e/db.sqlite")}` });

async function lastRun(kind: "daily" | "practice") {
  const db = testDb();
  const row = (
    await db.execute({
      sql: "SELECT * FROM maze_runs WHERE kind = ? ORDER BY id DESC LIMIT 1",
      args: [kind],
    })
  ).rows[0]!;
  db.close();
  const maze = transformMaze(
    generateMaze(String(row.seed), Number(row.size)),
    Number(row.transform),
  );
  return { id: Number(row.id), maze };
}

/** Кратчайший путь ходами. */
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

/** Какие клавиши жать: по коридору фишка едет сама, жать — на развилках. */
function presses(m: Maze): MazeDir[] {
  const r = route(m);
  const out: MazeDir[] = [];
  let pos = m.start;
  let i = 0;
  while (pos !== m.exit) {
    let d = r[i] as MazeDir;
    out.push(d);
    for (;;) {
      pos = neighbor(m.size, pos, d)!;
      i++;
      if (pos === m.exit) break;
      const next = corridorNext(m.cells[pos]!, d);
      if (!next) break;
      d = next;
    }
  }
  return out;
}

const KEY: Record<MazeDir, string> = {
  U: "ArrowUp",
  R: "ArrowRight",
  D: "ArrowDown",
  L: "ArrowLeft",
};

async function play(page: Page, m: Maze) {
  const field = page.locator(".field");
  for (const d of presses(m)) {
    await page.keyboard.press(KEY[d]);
    // Нажатое на ходу ждёт развилки — жмём, когда фишка встала.
    await page.waitForTimeout(30);
    await expect(field).toHaveAttribute("data-idle", "1");
  }
}

test.describe("Лабиринт", () => {
  test("читателю лабиринта нет", async ({ page }) => {
    await login(page, READER);
    const api = await page.request.get("/api/maze");
    expect(api.status()).toBe(404);
    await open(page, "/maze");
    await expect(page.getByText("Лабиринта сейчас нет.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Начать" })).toHaveCount(0);
  });

  test("тренировка: лабиринт проходится клавишами, время — по серверу", async ({
    page,
  }) => {
    await login(page, ADMIN);
    await open(page, "/maze");
    await page.getByRole("combobox").selectOption("9");
    await page.getByRole("button", { name: "Начать тренировку" }).click();
    await expect(
      page.getByRole("heading", { name: "Тренировка · 9×9" }),
    ).toBeVisible();

    const { id, maze } = await lastRun("practice");
    await play(page, maze);
    await expect(page.getByText(/В тепле! Время — \d+:\d\d\.\d/)).toBeVisible();

    const db = testDb();
    const row = (
      await db.execute({
        sql: "SELECT finished_at, moves FROM maze_runs WHERE id = ?",
        args: [id],
      })
    ).rows[0]!;
    db.close();
    expect(row.finished_at).not.toBeNull();
    expect(row.moves).toBe(route(maze));
  });

  test("забег дня: сквозь стену не пройти, после перезагрузки — с того же места", async ({
    page,
  }) => {
    await login(page, ADMIN);
    await open(page, "/maze");
    await page.getByRole("button", { name: "Начать", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: /^Лабиринт дня · \d+×\d+$/ }),
    ).toBeVisible();

    const { id, maze } = await lastRun("daily");
    const wall = MAZE_DIRS.find((d) => !isOpen(maze.cells[maze.start]!, d))!;
    const bad = await page.request.post("/api/maze/move", {
      data: { runId: id, at: 0, moves: wall },
    });
    expect(bad.status()).toBe(409);

    const first = presses(maze)[0]!;
    await page.keyboard.press(KEY[first]);
    await expect(page.locator(".field")).toHaveAttribute("data-idle", "1");
    // Ход дошёл до сервера — и после перезагрузки забег продолжается сам.
    await expect
      .poll(async () => {
        const db = testDb();
        const r = await db.execute({
          sql: "SELECT length(moves) AS n FROM maze_runs WHERE id = ?",
          args: [id],
        });
        db.close();
        return Number(r.rows[0]!.n);
      })
      .toBeGreaterThan(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: /^Лабиринт дня/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Начать", exact: true }),
    ).toHaveCount(0);
  });
});
