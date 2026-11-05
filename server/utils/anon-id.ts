import type { H3Event } from "h3";

const COOKIE = "tavern_anon";
const TWO_YEARS = 60 * 60 * 24 * 365 * 2;

/**
 * Метка гостя — случайная строка в его куке. Нужна, чтобы узнать «свою»
 * реакцию гостя: по IP за одним адресом (мобильный оператор, офис) разные
 * читатели видели бы реакции друг друга.
 *
 * С create: true выдаёт куку, если её ещё нет, — только там, где гость что-то
 * делает (ставит реакцию). Просто чтение куку не заводит.
 */
export function anonId(event: H3Event, create: true): string;
export function anonId(event: H3Event, create?: false): string | null;
export function anonId(event: H3Event, create = false): string | null {
  const existing = getCookie(event, COOKIE);
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing;
  if (!create) return null;

  const id = crypto.randomUUID();
  setCookie(event, COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: TWO_YEARS,
    secure:
      getRequestURL(event, { xForwardedProto: true }).protocol === "https:",
  });
  return id;
}
