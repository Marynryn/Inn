import { isJunkPath } from "../utils/junk-path";

/**
 * Мусорные пути сканеров — сразу короткий 404, до Vue Router: иначе каждый
 * такой запрос оставлял в логе предупреждение роутера, и всплески упирались в
 * лимит логов Railway. Что считается мусором — server/utils/junk-path.ts.
 */
export default defineEventHandler((event) => {
  const path = event.path.split("?")[0] ?? "";
  if (!isJunkPath(path)) return;

  setResponseStatus(event, 404);
  setResponseHeader(event, "Content-Type", "text/plain; charset=utf-8");
  return "Not Found";
});
