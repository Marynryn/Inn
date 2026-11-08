import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KNOWN_ROOTS, isJunkPath } from "../../server/utils/junk-path";

/** Первая часть адреса для файла или папки: about.vue → about, [id].ts → пропуск. */
const roots = (dir: string) =>
  readdirSync(dir)
    .map((name) => name.replace(/\.(vue|ts)$/, "").replace(/\.get$/, ""))
    .filter((name) => !name.startsWith("["))
    .map((name) => (name === "index" ? "" : name));

describe("мусорные пути", () => {
  it("каждая страница и серверный маршрут — в списке известных", () => {
    for (const root of [...roots("app/pages"), ...roots("server/routes")])
      expect(KNOWN_ROOTS, `«/${root}» нет в KNOWN_ROOTS`).toContain(root);
  });

  it("настоящие адреса доходят до сайта", () => {
    for (const path of [
      "/",
      "/about",
      "/about/",
      "/chapter/5-29",
      "/chapter/5-29/comments",
      "/characters",
      "/reader/abc",
      "/api/settings",
      "/auth/google",
      "/_nuxt/x/entry.css",
      "/_ipx/s_32x32/hearth.webp",
      "/__nuxt_island/ChapterText_abc.json",
      "/sitemap.xml",
    ])
      expect(isJunkPath(path), path).toBe(false);
  });

  it("сканеры получают короткий 404", () => {
    for (const path of [
      "/wp-login.php",
      "/chapter/x.php",
      "/.env",
      "/.git/config",
      "//xmlrpc.php",
      "/wp-admin/",
      "/cgi-bin/luci",
      "/backup.zip",
      "/.well-known/security.txt",
      "/admin.php",
    ])
      expect(isJunkPath(path), path).toBe(true);
  });
});
