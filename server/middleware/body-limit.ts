/**
 * Потолок на размер запроса. h3 читает тело целиком в память, и только
 * потом обработчик смотрит, что пришло: аватарке разрешено 300 КБ, но
 * прочитаны были бы и сотни мегабайт — а вход через телеграм ничего не стоит.
 *
 * Читателю хватает с запасом 2 МБ (аватарка после пережатия в браузере —
 * ~15 КБ). Панели — 64 МБ: туда грузят epub и картинки.
 *
 * С Content-Length отказываем сразу. Без него (передача кусками) тело
 * читаем сами, с потолком, и отдаём h3 уже прочитанным — он берёт его из
 * того же места, куда положил бы сам.
 */
const READER_LIMIT = 2 * 1024 * 1024;
const ADMIN_LIMIT = 64 * 1024 * 1024;

const RAW_BODY = Symbol.for("h3RawBody");
const WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const tooLarge = () =>
  createError({ statusCode: 413, message: "Слишком большой запрос" });

export default defineEventHandler((event) => {
  if (!WITH_BODY.has(event.method)) return;

  const limit = event.path.startsWith("/api/admin")
    ? ADMIN_LIMIT
    : READER_LIMIT;
  const req = event.node.req;

  const length = Number.parseInt(req.headers["content-length"] ?? "", 10);
  if (Number.isFinite(length)) {
    if (length > limit) throw tooLarge();
    return;
  }

  if (!/\bchunked\b/i.test(String(req.headers["transfer-encoding"] ?? "")))
    return;

  const body = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req
      .on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > limit) {
          reject(tooLarge());
          req.destroy();
          return;
        }
        chunks.push(chunk);
      })
      .on("end", () => resolve(Buffer.concat(chunks)))
      .on("error", reject);
  });
  // Обработчик может тело и не прочитать — тогда отказ некому поймать.
  body.catch(() => {});
  (req as unknown as Record<symbol, unknown>)[RAW_BODY] = body;
});
