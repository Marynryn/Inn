import { checkRateLimit } from "../utils/rate-limit";

/**
 * Отчёты браузеров о нарушениях CSP — строкой в лог. Так видно, если политика
 * закрыла что-то нужное (новый внешний скрипт, сервис аналитики). Отчёты
 * приходят от кого угодно, поэтому лимит: 10 в минуту с адреса и 60 на всех,
 * чтобы ими нельзя было забить логи.
 */
export default defineEventHandler(async (event) => {
  if (
    !checkRateLimit(`csp:${clientIp(event)}`, 10, 60_000) ||
    !checkRateLimit("csp:all", 60, 60_000)
  ) {
    setResponseStatus(event, 204);
    return null;
  }

  const body = await readBody(event).catch(() => null);
  const report = (body as { "csp-report"?: Record<string, unknown> } | null)?.[
    "csp-report"
  ];
  if (report) {
    const field = (key: string) => String(report[key] ?? "").slice(0, 200);
    console.warn(
      `[csp] ${field("violated-directive")} заблокировал ${field("blocked-uri")} на ${field("document-uri")} (${field("source-file")}:${field("line-number")})`,
    );
  }

  setResponseStatus(event, 204);
  return null;
});
