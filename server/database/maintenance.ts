import type { Client } from "@libsql/client";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { countWords } from "#shared/utils/wordCount";

/**
 * Уборка на каждом старте, после миграций. Это не изменения схемы, а то, что
 * должно происходить регулярно: досчитать слова, выбросить старые счётчики по
 * дням, завести недостающие настройки и первого админа, включить WAL. Всё
 * здесь безопасно повторять сколько угодно раз.
 */
export async function maintenance(client: Client) {
  // Длина главы в словах — для трекера прогресса. Новые главы считаются при
  // сохранении, а уже загруженные досчитываем здесь: по одной, чтобы не
  // поднимать в память весь перевод разом. Глава с нулём слов при пустом
  // тексте пересчитается на каждом старте — это один дешёвый запрос.
  const uncounted = await client.execute(
    "SELECT id FROM chapters WHERE word_count = 0 AND content_html != ''",
  );
  for (const row of uncounted.rows) {
    const id = (row as any).id as string;
    const chapter = await client.execute({
      sql: "SELECT content_html FROM chapters WHERE id = ?",
      args: [id],
    });
    const html = ((chapter.rows[0] as any)?.content_html ?? "") as string;
    await client.execute({
      sql: "UPDATE chapters SET word_count = ? WHERE id = ?",
      args: [countWords(html), id],
    });
  }
  if (uncounted.rows.length)
    console.log(`[migrate] Посчитаны слова в главах: ${uncounted.rows.length}`);

  // Счётчики по дням держим, сколько показывает панель: разных читателей и
  // заходы в настольную игру — месяц, просмотры и скачивания — неделю (на
  // экране только «сегодня»), партии игры — месяц (страница показывает только
  // сегодняшнюю и текущую свободную).
  for (const sql of [
    "DELETE FROM reader_days WHERE day < date('now', '-30 day')",
    "DELETE FROM board_visit_days WHERE day < date('now', '-30 day')",
    "DELETE FROM chapter_view_days WHERE day < date('now', '-7 day')",
    "DELETE FROM chapter_download_days WHERE day < date('now', '-7 day')",
    "DELETE FROM game_sessions WHERE day < date('now', '-30 day')",
  ])
    await client.execute(sql);

  // Всегда исправлять главы с sort_order = 0 по published_at
  await client.execute(`
    UPDATE chapters SET sort_order = (
      SELECT COUNT(*) FROM chapters c2 WHERE c2.published_at <= chapters.published_at
    ) WHERE sort_order = 0
  `);

  // Дефолтные настройки сайта
  const defaults: Record<string, string> = {
    hero_title: "Истории трактира,\nрассказанные заново",
    hero_subtitle:
      "Продолжение перевода с главы 4.12. Цветное оформление речи персонажей, регулярные обновления, epub для скачивания — глава за главой.",
    // Бегущая строка под hero, по фразе на строку. Зазыв завести аккаунт —
    // видят её только незарегистрированные.
    hero_ticker:
      "В таверне завели книгу постояльцев\nЗаведи аккаунт — закладка будет на всех устройствах\nОтветят на комментарий — придёт уведомление\nВход через Google или Telegram, за полминуты",
    hero_ticker_on: "1",
    ledger_note: "том.глава — нумерация как в оригинале",
    footer_text:
      "Фанатский перевод. Оригинал — wanderinginn.com, автор Pirateaba.\nНекоммерческий проект. Все права на оригинальное произведение принадлежат автору.",
    telegram_url: "https://t.me/",
    boosty_url: "https://boosty.to/",
    tribute_url: "",
    error_404_sub: "Козёл добрался до этой страницы раньше тебя.",
    tg_cta_title: "Не пропусти новую главу",
    tg_cta_text:
      "Бот в телеграм-канале присылает уведомление о каждой новой главе сразу после публикации.",
    update_schedule: "2–3",
    // Пусто — потолок тома для персонажа дня считается по границе перевода.
    // Число здесь означает ручной потолок и границу перевода перебивает.
    game_max_volume: "",
    game_cta_title: "Кто из таверны?",
    game_cta_text:
      "Угадай персонажа по признакам: вид, занятие, том появления. Новый — каждый день, и только те, кто встречался до {том} тома.",
    characters_title: "Кто живёт в таверне",
    characters_subtitle:
      "Те, кого читатель встречал не раз в первых томах. Нажми на карточку — откроется подробнее, огонёк — чтобы отметить любимых.",
    // Сезонное оформление (app/utils/season.ts): autumn — листья, winter —
    // снег и сосульки. Записывается, только если настройки ещё нет, поэтому
    // переключённое в админке не перетирается при перезапуске.
    season: "winter",
  };

  for (const [key, value] of Object.entries(defaults)) {
    await client.execute({
      sql: "INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)",
      args: [key, value],
    });
  }

  // Первый админ на пустой базе. Пароль — из ADMIN_PASSWORD, а без неё
  // случайный, один раз в лог. Раньше здесь стоял общеизвестный admin123: сайт,
  // поднявшийся на пустой базе (том не подключился, STORAGE_DIR указал не
  // туда), пускал в панель любого, кто его знал.
  const existing = await client.execute("SELECT COUNT(*) as cnt FROM users");
  const count = (existing.rows[0] as any).cnt as number;
  if (count === 0) {
    const fromEnv = process.env.ADMIN_PASSWORD?.trim();
    const password = fromEnv || randomBytes(12).toString("base64url");
    const hash = await bcrypt.hash(password, 12);
    await client.execute({
      sql: "INSERT INTO users (email, password_hash, role, display_name, display_name_key) VALUES (?, ?, 'admin', ?, ?)",
      args: ["admin@tavern.local", hash, "admin", "admin"],
    });
    console.log(
      fromEnv
        ? "[migrate] Admin created: admin@tavern.local, пароль — из ADMIN_PASSWORD"
        : `[migrate] Admin created: admin@tavern.local / ${password} — пароль случайный, смени его в панели`,
    );
  }

  // Журнал WAL: чтение не ждёт записи, а запись не ждёт сброса на диск двух
  // файлов. Просмотры глав пишутся на каждом открытии, и в прежнем режиме каждая
  // такая запись дожидалась диска, пока сервер стоял. Режим хранится в самом
  // файле базы — ставится один раз и действует для всех подключений.
  // Переключение режима ждёт, пока базу не отпустят все читатели. Не дождались —
  // сайт работает и в прежнем режиме, а WAL включится при следующем запуске.
  try {
    await client.execute("PRAGMA journal_mode = WAL");
  } catch (e) {
    console.warn(
      "[migrate] WAL не включился, попробуем при следующем запуске:",
      e,
    );
  }
}
