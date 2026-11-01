/**
 * Сканеры уязвимостей перебирают /wp-login.php, /.env, //xmlrpc.php и т. п.
 * Без этого каждый такой запрос доходил до Vue Router, тот писал в лог
 * предупреждение (R0003 на двойной слэш, R0004 на 404), и сотни запросов в
 * минуту упирались в лимит логов Railway — терялись настоящие записи.
 * Отвечаем коротким 404 раньше рендера: PHP на сайте нет, служебных файлов тоже.
 */
const SCANNER_PATH = /\.php\d?(?:\/|$)|^\/\.(?:env|git|svn|aws|ht)|^\/\//i;

export default defineEventHandler((event) => {
  const path = event.path.split("?")[0] ?? "";
  if (!SCANNER_PATH.test(path)) return;

  setResponseStatus(event, 404);
  setResponseHeader(event, "Content-Type", "text/plain; charset=utf-8");
  return "Not Found";
});
