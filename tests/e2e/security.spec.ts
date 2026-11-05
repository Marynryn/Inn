import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import JSZip from "jszip";
import { test, expect, login } from "./helpers";
import { ADMIN, CHAPTERS, READER } from "./fixtures";

/** База тестового сервера — та, что вычищает tests/e2e/serve.mjs. */
const testDb = () =>
  createClient({ url: `file:${resolve(".data/e2e/db.sqlite")}` });

test.describe("Защита", () => {
  test("после десяти неверных паролей с одного адреса вход закрыт", async ({
    page,
    playwright,
  }, info) => {
    const nobody = {
      email: `nobody-${Date.now()}@test.local`,
      password: "wrong-password-123",
    };
    for (let i = 0; i < 10; i++) {
      const res = await page.request.post("/api/auth/login", { data: nobody });
      expect(res.status()).toBe(401);
    }

    // Одиннадцатая попытка — отказ, даже с верным паролем.
    const blocked = await page.request.post("/api/auth/login", {
      data: READER,
    });
    expect(blocked.status()).toBe(429);

    // С другого адреса читатель входит как обычно.
    const other = await playwright.request.newContext({
      baseURL: info.project.use.baseURL,
      extraHTTPHeaders: { "x-forwarded-for": "10.251.0.7" },
    });
    expect((await other.post("/api/auth/login", { data: READER })).ok()).toBe(
      true,
    );
    await other.dispose();
  });

  test("адрес берётся из X-Real-IP, а не из подделанного X-Forwarded-For", async ({
    playwright,
  }, info) => {
    // Как за краем Railway: X-Real-IP ставит он, X-Forwarded-For — кто угодно.
    const realIp = "10.252.0.1";
    const post = async (i: number) => {
      const ctx = await playwright.request.newContext({
        baseURL: info.project.use.baseURL,
        extraHTTPHeaders: {
          "x-real-ip": realIp,
          "x-forwarded-for": `10.253.${i}.1`,
        },
      });
      const res = await ctx.post("/api/comments", {
        data: { body: `Проверка лимита ${Date.now()}-${i}`, authorName: "" },
      });
      await ctx.dispose();
      return res.status();
    };

    for (let i = 0; i < 5; i++) expect(await post(i)).toBe(200);
    // Шестой за минуту — отказ, хотя X-Forwarded-For каждый раз новый.
    expect(await post(5)).toBe(429);
  });

  test("снятая роль закрывает панель и для уже выданной сессии", async ({
    page,
    browser,
  }, info) => {
    const demoted = {
      email: `demoted-${Date.now()}@tavern.local`,
      password: "demoted-pass-123",
    };
    await login(page, ADMIN);
    expect(
      (
        await page.request.post("/api/admin/users", {
          data: { ...demoted, role: "admin" },
        })
      ).ok(),
    ).toBe(true);

    const ctx = await browser.newContext({
      baseURL: info.project.use.baseURL,
      extraHTTPHeaders: { "x-forwarded-for": "10.250.9.9" },
    });
    const other = await ctx.newPage();
    await login(other, demoted);
    expect((await other.request.get("/api/admin/stats")).status()).toBe(200);

    // Роль сняли прямо в базе — кука сессии при этом прежняя, с role: admin.
    const db = testDb();
    await db.execute({
      sql: "UPDATE users SET role = 'reader' WHERE email = ?",
      args: [demoted.email],
    });
    db.close();

    expect((await other.request.get("/api/admin/stats")).status()).toBe(403);
    await ctx.close();
  });

  test("сброс статистики — только POST с подтверждением", async ({ page }) => {
    await login(page, ADMIN);
    const viaGet = await page.request.get("/api/admin/stats-reset?confirm=yes");
    expect(viaGet.ok()).toBe(false);

    const noConfirm = await page.request.post("/api/admin/stats-reset", {
      data: {},
    });
    expect(noConfirm.status()).toBe(400);

    const ok = await page.request.post("/api/admin/stats-reset", {
      data: { confirm: "yes", chapterId: CHAPTERS[0]!.id },
    });
    expect(ok.ok()).toBe(true);
  });

  test("заголовки безопасности на страницах и в API", async ({ page }) => {
    for (const url of ["/", "/api/settings"]) {
      const res = await page.request.get(url);
      const h = res.headers();
      expect(h["x-content-type-options"], url).toBe("nosniff");
      expect(h["x-frame-options"], url).toBe("SAMEORIGIN");
      expect(h["content-security-policy"], url).toContain(
        "frame-ancestors 'self'",
      );
      expect(h["referrer-policy"], url).toBeTruthy();
    }
  });

  test("двойной клик ставит один лайк, а несуществующему комментарию — 404", async ({
    page,
  }) => {
    const created = await page.request.post("/api/comments", {
      data: { body: `Лайкни меня ${Date.now()}`, authorName: "" },
    });
    expect(created.ok()).toBe(true);
    const { id } = await created.json();

    await login(page, READER);
    // Два запроса разом — как двойной клик.
    await Promise.all([
      page.request.post(`/api/comments/${id}/react`, {
        data: { type: "like" },
      }),
      page.request.post(`/api/comments/${id}/react`, {
        data: { type: "like" },
      }),
    ]);
    const db = testDb();
    const rows = await db.execute({
      sql: "SELECT COUNT(*) AS n FROM comment_reactions WHERE comment_id = ?",
      args: [id],
    });
    db.close();
    // Один лайк или ни одного (второй запрос мог его снять), но не два.
    expect(Number(rows.rows[0]!.n)).toBeLessThanOrEqual(1);

    const missing = await page.request.post("/api/comments/99999999/react", {
      data: { type: "like" },
    });
    expect(missing.status()).toBe(404);
  });

  test("админ скачивает полную копию: база и epub в одном zip", async ({
    page,
  }) => {
    await login(page, READER);
    expect((await page.request.get("/api/admin/backup")).status()).toBe(403);

    await login(page, ADMIN);
    const res = await page.request.get("/api/admin/backup");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(
      /attachment; filename="taverna-backup-.+\.zip"/,
    );

    const zip = await JSZip.loadAsync(await res.body());
    const names = Object.keys(zip.files);
    expect(names).toContain("db.sqlite");
    expect(names.some((n) => n.startsWith("epubs/"))).toBe(true);

    const db = await zip.file("db.sqlite")!.async("nodebuffer");
    expect(db.subarray(0, 15).toString()).toBe("SQLite format 3");
  });

  test("снимок базы по кнопке ложится в список резервных копий", async ({
    page,
  }) => {
    await login(page, READER);
    expect((await page.request.post("/api/admin/backups")).status()).toBe(403);

    await login(page, ADMIN);
    const run = await page.request.post("/api/admin/backups");
    expect(run.ok()).toBe(true);
    const result = await run.json();
    expect(result.file).toMatch(/^db-.+\.sqlite\.gz$/);

    const list = await (await page.request.get("/api/admin/backups")).json();
    expect(list.keep).toBe(7);
    expect(list.snapshots.map((s: { file: string }) => s.file)).toContain(
      result.file,
    );
  });
});
