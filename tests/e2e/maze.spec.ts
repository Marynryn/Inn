import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, login, open, apiLogin } from "./helpers";
import { ADMIN, READER, SECOND } from "./fixtures";
import type { Maze, MazeDir } from "../../shared/utils/maze";
import {
  MAZE_DIRS,
  corridorNext,
  generateMaze,
  isOpen,
  neighbor,
  transformMaze,
} from "../../shared/utils/maze";
import { MAZE_TEAMS } from "../../shared/utils/mazeTournament";

/**
 * Лабиринт и турнир. Лабиринт знает только сервер, поэтому сценарий
 * подсматривает его в базе тестового сервера (сид и поворот забега) и
 * проходит по кратчайшему пути клавишами, как игрок.
 *
 * Режим ивента и турнир — общие на всю базу: в конце файла турнир удаляется,
 * ивент выключается, чтобы плашка лабиринта не попала в соседние сценарии.
 */

test.describe.configure({ mode: "serial" });

const testDb = () =>
  createClient({ url: `file:${resolve(".data/e2e/db.sqlite")}` });

async function lastRun(kind: "round" | "practice") {
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

let admin: APIRequestContext;

const setMode = async (mode: string) => {
  const res = await admin.put("/api/admin/settings", {
    data: { maze_mode: mode, maze_sizes: "9,9,11,11,13" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
};

/** Удалить все турниры — уборка после сценария. */
async function clearTournaments() {
  for (;;) {
    const res = await admin.get("/api/admin/maze");
    const t = (await res.json()).tournament;
    if (!t) return;
    await admin.delete(`/api/admin/maze/tournaments/${t.id}`);
  }
}

test.describe("Лабиринт", () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    admin = await playwright.request.newContext({ baseURL });
    await apiLogin(admin, ADMIN);
  });

  test.afterAll(async () => {
    await clearTournaments();
    await setMode("off");
    await admin.dispose();
  });

  test("ивент выключен — читателю лабиринта нет", async ({ page }) => {
    await login(page, READER);
    expect((await page.request.get("/api/maze")).status()).toBe(404);
    await open(page, "/maze");
    await expect(page.getByText("Лабиринта сейчас нет.")).toBeVisible();
  });

  test("турнир: вступление, команды, забег дня, итог дня", async ({
    page,
    playwright,
    baseURL,
  }) => {
    await setMode("on");
    const started = await admin.post("/api/admin/maze/start");
    expect(started.ok(), await started.text()).toBeTruthy();

    await login(page, READER);
    await open(page, "/maze");
    await expect(page.getByText(/Турнир №1 · день 1 из 5/)).toBeVisible();
    await page.getByRole("button", { name: "Участвовать" }).click();
    const joined = page.getByRole("heading", { name: /Ты в команде/ });
    await expect(joined).toBeVisible();
    const myTeam = (await joined.textContent())!.includes(MAZE_TEAMS.goblins.of)
      ? "goblins"
      : "antinium";

    // Второй вступивший — в другой команде: было один на ноль.
    const second = await playwright.request.newContext({ baseURL });
    await apiLogin(second, SECOND);
    const other = await (await second.post("/api/maze/join")).json();
    expect(other.team).not.toBe(myTeam);
    await second.dispose();

    await open(page, "/maze");
    await page.getByRole("button", { name: "Начать", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "День 1 из 5 · 9×9" }),
    ).toBeVisible();
    const { maze } = await lastRun("round");
    await play(page, maze);
    await expect(
      page.getByText(/В тепле! Время — \d+:\d\d\.\d\d/),
    ).toBeVisible();

    await page.getByRole("button", { name: "Смотреть табло" }).click();
    await expect(
      page.getByText(`Сегодня ведут ${MAZE_TEAMS[myTeam].name}`, {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByText(/Твоё время сегодня/)).toBeVisible();
    // Второй забег за день не начать.
    await expect(
      page.getByRole("button", { name: "Начать", exact: true }),
    ).toHaveCount(0);

    // День закончили кнопкой — очко засчитано, начался день 2.
    expect((await admin.post("/api/admin/maze/advance")).ok()).toBeTruthy();
    await open(page, "/maze");
    await expect(
      page.getByRole("heading", { name: "День 2 · 9×9" }),
    ).toBeVisible();
    await expect(page.getByText(/Турнир №1 · день 2 из 5/)).toBeVisible();
    await expect(page.locator(".mark", { hasText: "очко" })).toBeVisible();
  });

  test("гость видит турнир и зовётся войти; на главной — плашка", async ({
    page,
  }) => {
    await open(page, "/maze");
    await expect(page.getByText(/Турнир №1 · день 2 из 5/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Войти и участвовать" }),
    ).toBeVisible();
    await open(page, "/");
    const banner = page.locator(".maze-banner");
    await expect(banner).toBeVisible();
    await banner.getByRole("link", { name: "В лабиринт" }).click();
    await expect(page).toHaveURL(/\/maze$/);
  });

  test("проба для админов: читатель не видит ни страницы, ни плашки", async ({
    page,
  }) => {
    await setMode("admins");
    await login(page, READER);
    expect((await page.request.get("/api/maze")).status()).toBe(404);
    await open(page, "/");
    await expect(page.locator(".maze-banner")).toHaveCount(0);
    // У админа — и плашка, и игра.
    expect(await (await admin.get("/api/maze/banner")).json()).not.toBeNull();
  });

  test("тренировка админа проходится клавишами", async ({ page }) => {
    await login(page, ADMIN);
    await open(page, "/maze");
    await page.getByRole("combobox").selectOption("9");
    await page.getByRole("button", { name: "Начать тренировку" }).click();
    await expect(
      page.getByRole("heading", { name: "Тренировка · 9×9" }),
    ).toBeVisible();
    const { id, maze } = await lastRun("practice");
    await play(page, maze);
    await expect(page.getByText(/В тепле! Время/)).toBeVisible();
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
});
