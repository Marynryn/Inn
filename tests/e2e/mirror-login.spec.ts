import { createHash, createHmac } from "node:crypto";
import { test, expect } from "./helpers";
import {
  issueHandoffTicket,
  takeHandoffTicket,
} from "../../server/utils/handoff";

/*
  Вход на зеркале taverna-book.ru. Google пускает с обоих доменов, поэтому
  возвращает прямо туда, откуда пришли. Телеграм-боту выдан один домен —
  основной, — поэтому с зеркала вход идёт через основной домен, а на зеркало
  передаётся коротким одноразовым билетом. Стенд изображает зеркало заголовком
  Host: сервер тот же, домен другой.
*/
const MIRROR = "taverna-book.ru";
const onMirror = { host: MIRROR };

test.describe("Вход через Google на основном домене и на зеркале", () => {
  test("на основном домене — 302 к Google, возврат сюда же", async ({
    page,
  }) => {
    const res = await page.request.get("/auth/google?next=/game", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(302);
    const to = new URL(res.headers()["location"]!);
    expect(to.origin).toBe("https://accounts.google.com");
    expect(to.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3100/auth/google",
    );
    expect(to.searchParams.get("client_id")).toBe("e2e-google-client");
    expect(to.searchParams.get("state")).toBe("");
    expect(to.searchParams.get("scope")).toBe("openid email profile");
  });

  test("на зеркале Google возвращает на само зеркало", async ({ page }) => {
    const res = await page.request.get("/auth/google?next=/game", {
      maxRedirects: 0,
      headers: onMirror,
    });
    expect(res.status()).toBe(302);
    const to = new URL(res.headers()["location"]!);
    expect(to.origin).toBe("https://accounts.google.com");
    expect(to.searchParams.get("redirect_uri")).toBe(
      `http://${MIRROR}/auth/google`,
    );
  });

  test("негодный код от Google ведёт на страницу входа с причиной, а не на страницу ошибки", async ({
    page,
  }) => {
    // Код негодный, да и Google для сервера недостижим — обработчик спотыкается.
    // Важно, что не голой страницей ошибки: человек возвращается на вход и
    // видит, что случилось, а код причины можно прислать разработчику.
    const res = await page.request.get(
      "/auth/google?code=stale-code&scope=email",
      { maxRedirects: 0 },
    );
    expect(res.status()).toBe(302);
    expect(res.headers()["location"]).toMatch(/^\/login\?error=google&reason=/);

    await page.goto(res.headers()["location"]!);
    await expect(page.locator(".err")).toContainText("Google не завершил вход");
  });
});

/*
  Возврат от телеграма собираем сами: подпись считается по токену бота, который
  в стенде выдуманный.
*/
const TOKEN = "123456:e2e-telegram-token";

/** Подпись по правилам телеграма — считаем сами, независимо от сервера. */
function telegramSignature(token: string, fields: Record<string, string>) {
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHash("sha256").update(token).digest();
  return createHmac("sha256", secret).update(check).digest("hex");
}

function telegramReturn(id: string, name: string) {
  const fields: Record<string, string> = {
    id,
    first_name: name,
    auth_date: String(Math.floor(Date.now() / 1000)),
  };
  const hash = telegramSignature(TOKEN, fields);
  return new URLSearchParams({ ...fields, hash }).toString();
}

test.describe("Вход через Telegram на основном домене и на зеркале", () => {
  test("на основном домене — возврат на свой /auth/telegram/done", async ({
    page,
  }) => {
    const res = await page.request.get("/auth/telegram?next=/game", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(302);
    const to = new URL(res.headers()["location"]!);
    expect(to.origin).toBe("https://oauth.telegram.org");
    expect(to.searchParams.get("bot_id")).toBe("123456");
    expect(to.searchParams.get("origin")).toBe("http://localhost:3100");
    expect(to.searchParams.get("return_to")).toBe(
      "http://localhost:3100/auth/telegram/done",
    );
  });

  test("с зеркала телеграм возвращает на основной домен, с зеркалом в пути", async ({
    page,
  }) => {
    const res = await page.request.get("/auth/telegram?next=/game", {
      maxRedirects: 0,
      headers: onMirror,
    });
    expect(res.status()).toBe(302);
    const to = new URL(res.headers()["location"]!);
    expect(to.origin).toBe("https://oauth.telegram.org");
    expect(to.searchParams.get("origin")).toBe("http://localhost:3100");
    expect(to.searchParams.get("return_to")).toBe(
      `http://localhost:3100/auth/telegram/done/${MIRROR}`,
    );
  });

  test("возврат на основной домен с подписью телеграма ставит сессию", async ({
    page,
  }) => {
    const res = await page.request.get(
      `/auth/telegram/done?${telegramReturn("900001", "Прямой")}`,
      { maxRedirects: 0 },
    );
    expect(res.status()).toBe(302);
    // Новичок — на профиль.
    expect(res.headers()["location"]).toBe("/profile");
    const me = await (await page.request.get("/api/auth/me")).json();
    expect(me.displayName).toBe("Прямой");
  });

  test("возврат для зеркала выдаёт билет, по которому зеркало впускает", async ({
    page,
  }) => {
    const res = await page.request.get(
      `/auth/telegram/done/${MIRROR}?${telegramReturn("900002", "Зеркальный")}`,
      { maxRedirects: 0 },
    );
    expect(res.status()).toBe(302);
    const location = res.headers()["location"]!;
    expect(location).toMatch(
      /^https:\/\/taverna-book\.ru\/auth\/handoff\?t=[A-Za-z0-9]{12}$/,
    );

    // Зеркало (тот же сервер под другим Host) забирает билет и впускает.
    const ticket = new URL(location).searchParams.get("t")!;
    const handoff = await page.request.get(`/auth/handoff?t=${ticket}`, {
      maxRedirects: 0,
      headers: onMirror,
    });
    expect(handoff.status()).toBe(302);
    expect(handoff.headers()["location"]).toBe("/profile");
    const me = await (await page.request.get("/api/auth/me")).json();
    expect(me.displayName).toBe("Зеркальный");

    // Билет одноразовый.
    const again = await page.request.get(`/auth/handoff?t=${ticket}`, {
      maxRedirects: 0,
    });
    expect(again.headers()["location"]).toBe(
      "/login?error=telegram&reason=handoff",
    );
  });

  test("чужое зеркало в пути — 404, подделанная подпись — на вход с причиной", async ({
    page,
  }) => {
    const bad = await page.request.get(
      `/auth/telegram/done/evil.example?${telegramReturn("900003", "Чужой")}`,
      { maxRedirects: 0 },
    );
    expect(bad.status()).toBe(404);

    const forged = await page.request.get(
      "/auth/telegram/done?id=900004&first_name=X&auth_date=1&hash=" +
        "ab".repeat(32),
      { maxRedirects: 0 },
    );
    expect(forged.status()).toBe(302);
    expect(forged.headers()["location"]).toBe(
      "/login?error=telegram&reason=signature",
    );
    await page.goto(forged.headers()["location"]!);
    await expect(page.locator(".err")).toContainText(
      "Telegram не завершил вход",
    );
  });

  test("билет одноразовый, короткий и живёт минуту", () => {
    const ticket = issueHandoffTicket({ userId: 7, created: true });
    expect(ticket).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(takeHandoffTicket(ticket)).toEqual({ userId: 7, created: true });
    expect(takeHandoffTicket(ticket)).toBeNull();

    const stale = issueHandoffTicket(
      { userId: 8, created: false },
      Date.now() - 61_000,
    );
    expect(takeHandoffTicket(stale)).toBeNull();
    expect(takeHandoffTicket("nonsense")).toBeNull();
    expect(takeHandoffTicket(undefined)).toBeNull();
  });

  test("выдуманный билет не даёт сессии и возвращает на вход", async ({
    page,
  }) => {
    const res = await page.request.get("/auth/handoff?t=abcdefghijkl", {
      maxRedirects: 0,
      headers: onMirror,
    });
    expect(res.status()).toBe(302);
    expect(res.headers()["location"]).toBe(
      "/login?error=telegram&reason=handoff",
    );
    const me = await (await page.request.get("/api/auth/me")).text();
    expect(["", "null"]).toContain(me);
  });
});
