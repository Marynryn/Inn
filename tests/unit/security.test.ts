import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import { clientIp } from "../../server/utils/client-ip";
import {
  checkRateLimit,
  hitRateLimit,
  isRateLimited,
} from "../../server/utils/rate-limit";
import { addNonce, contentSecurityPolicy } from "../../server/utils/csp";
import { NUXT_IMG_ONERROR } from "../../shared/utils/inlineScripts";
import {
  issueHandoffTicket,
  takeHandoffTicket,
} from "../../server/utils/handoff";
import {
  PASSWORD_MIN,
  requireStrongPassword,
} from "../../server/utils/password";

const event = (headers: Record<string, string>, remote = "127.0.0.1") =>
  ({
    node: { req: { headers, socket: { remoteAddress: remote } } },
    context: {},
  }) as unknown as H3Event;

describe("clientIp", () => {
  it("верит X-Real-IP края Railway, а не первому X-Forwarded-For", () => {
    expect(
      clientIp(event({ "x-real-ip": "5.6.7.8", "x-forwarded-for": "1.1.1.1" })),
    ).toBe("5.6.7.8");
  });
  it("за Cloudflare берёт CF-Connecting-IP", () => {
    expect(
      clientIp(
        event({ "x-real-ip": "104.16.1.1", "cf-connecting-ip": "9.9.9.9" }),
      ),
    ).toBe("9.9.9.9");
  });
  it("CF-Connecting-IP не от Cloudflare — подделка, её не слушаем", () => {
    expect(
      clientIp(
        event({ "x-real-ip": "7.7.7.7", "cf-connecting-ip": "9.9.9.9" }),
      ),
    ).toBe("7.7.7.7");
  });
  it("вне Railway — последний X-Forwarded-For, потом сокет", () => {
    expect(clientIp(event({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe(
      "2.2.2.2",
    );
    expect(clientIp(event({}, "10.0.0.5"))).toBe("10.0.0.5");
  });
  it("не-адрес в заголовке игнорируется", () => {
    expect(clientIp(event({ "x-real-ip": "<script>" }, "10.0.0.5"))).toBe(
      "10.0.0.5",
    );
  });
});

describe("лимиты", () => {
  it("пускает max раз за окно, потом отказывает, после окна — снова", () => {
    vi.useFakeTimers();
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(checkRateLimit(key, 3, 1000)).toBe(true);
    expect(checkRateLimit(key, 3, 1000)).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(checkRateLimit(key, 3, 1000)).toBe(true);
    vi.useRealTimers();
  });
  it("isRateLimited только смотрит, hitRateLimit только считает", () => {
    const key = `t:${Math.random()}`;
    expect(isRateLimited(key, 1)).toBe(false);
    hitRateLimit(key, 60_000);
    expect(isRateLimited(key, 1)).toBe(true);
    expect(isRateLimited(key, 2)).toBe(false);
  });
});

describe("CSP", () => {
  it("nonce ставится всем <script> и не дублируется", () => {
    const [html] = addNonce(
      [
        '<script>a()</script><script type="module" src="/x.js"></script><script nonce="old">b()</script>',
      ],
      "N",
    );
    expect(html.match(/nonce="N"/g)).toHaveLength(2);
    expect(html).toContain('nonce="old"');
  });
  it("в политике nonce, хэш скрипта читалки и Clarity — только с ID", () => {
    const without = contentSecurityPolicy({ nonce: "N" });
    expect(without).toContain("'nonce-N'");
    expect(without).toMatch(/'sha256-[A-Za-z0-9+/=]+'/);
    expect(without).not.toContain("clarity");
    expect(without).toContain("frame-ancestors 'self'");

    const withClarity = contentSecurityPolicy({ nonce: "N", clarityId: "abc" });
    expect(withClarity).toContain("https://www.clarity.ms");
    // Скрипт читалки, onerror картинок и сниппет Clarity.
    expect(withClarity.match(/'sha256-/g)).toHaveLength(3);
  });
  it("onerror картинок Nuxt Image пропускается по хэшу — тот самый, что в пакете", () => {
    expect(contentSecurityPolicy({ nonce: "N" })).toContain("'unsafe-hashes'");
    // Обновили @nuxt/image и строка поменялась — хэш в политике больше не
    // совпадёт, и браузер начнёт жаловаться на каждой странице с картинкой.
    for (const c of ["NuxtImg", "NuxtPicture"]) {
      const src = readFileSync(
        `node_modules/@nuxt/image/dist/runtime/components/${c}.vue`,
        "utf8",
      );
      expect(src).toContain(JSON.stringify(NUXT_IMG_ONERROR));
    }
  });
});

describe("билет передачи входа на зеркало", () => {
  it("действует один раз", () => {
    const t = issueHandoffTicket({ userId: 7, created: false });
    expect(takeHandoffTicket(t)).toEqual({ userId: 7, created: false });
    expect(takeHandoffTicket(t)).toBeNull();
  });
  it("сгорает через минуту", () => {
    const t = issueHandoffTicket({ userId: 7, created: true }, 0);
    expect(takeHandoffTicket(t, 61_000)).toBeNull();
  });
  it("выдуманный или не строка — null", () => {
    expect(takeHandoffTicket("nope")).toBeNull();
    expect(takeHandoffTicket(42)).toBeNull();
  });
});

describe("пароль", () => {
  it(`короче ${PASSWORD_MIN} символов — отказ`, () => {
    expect(() => requireStrongPassword("short")).toThrow();
    expect(() => requireStrongPassword(123456789012345)).toThrow();
    expect(requireStrongPassword("x".repeat(PASSWORD_MIN))).toHaveLength(
      PASSWORD_MIN,
    );
  });
});
