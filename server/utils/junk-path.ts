/**
 * Сканеры уязвимостей перебирают /wp-login.php, /.env, //xmlrpc.php и т. п.
 * Без отсева каждый такой запрос доходил до Vue Router, тот писал в лог
 * предупреждение (R0003 на двойной слэш, R0004 на 404), и сотни запросов в
 * минуту упирались в лимит логов Railway — терялись настоящие записи.
 */
const SCANNER_PATH = /\.php\d?(?:\/|$)|^\/\.(?:env|git|svn|aws|ht)|^\/\//i;

/**
 * Список мусора всегда отстаёт от сканеров (/wp-admin/, /cgi-bin/, /backup.zip…),
 * поэтому второе правило — наоборот, по тому, что у сайта есть. До Vue Router
 * доходит только путь, чья первая часть — страница из app/pages или серверный
 * маршрут. Файлы из public сюда не попадают: их отдаёт обработчик статики,
 * который стоит раньше middleware.
 *
 * Новая страница или серверный маршрут с новой первой частью — добавить сюда,
 * иначе она будет отвечать голым 404. С папками сверяет
 * tests/unit/junk-path.test.ts.
 */
export const KNOWN_ROOTS = new Set([
  // страницы — app/pages
  "",
  "about",
  "admin",
  "board",
  "cards",
  "chapter",
  "characters",
  "game",
  "login",
  "profile",
  "progress",
  "reader",
  // серверные маршруты — server/api, server/routes, модули Nuxt
  "api",
  "auth",
  "sitemap.xml",
  "_ws",
  "_board",
  "_cards",
  "_nuxt",
  "_ipx",
  "_fonts",
  "__nuxt_island",
  "__nuxt_error",
]);

/** Путь без query. true — отвечать коротким 404, не доводя до рендера. */
export function isJunkPath(path: string): boolean {
  if (SCANNER_PATH.test(path)) return true;
  return !KNOWN_ROOTS.has(path.split("/")[1] ?? "");
}
