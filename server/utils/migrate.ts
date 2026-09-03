import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'

export async function runMigrations() {
  const storageDir = process.env.STORAGE_DIR || 'storage'
  const client = createClient({ url: `file:${storageDir}/db.sqlite` })

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      volume INTEGER NOT NULL,
      title TEXT NOT NULL,
      content_html TEXT NOT NULL DEFAULT '',
      epub_path TEXT,
      published_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'reader' CHECK(role IN ('admin','reader'))
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id TEXT,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chapter_stats (
      chapter_id TEXT PRIMARY KEY,
      views_count INTEGER NOT NULL DEFAULT 0,
      downloads_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `)

  // Таблица реакций на комментарии
  await client.execute(`
    CREATE TABLE IF NOT EXISTS comment_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('like','dislike')),
      user_id INTEGER,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Новые столбцы для аватарки и привязки комментария к пользователю
  const newCols = [
    'ALTER TABLE users ADD COLUMN avatar_url TEXT',
    'ALTER TABLE users ADD COLUMN display_name TEXT',
    'ALTER TABLE comments ADD COLUMN user_id INTEGER',
    'ALTER TABLE comments ADD COLUMN is_spoiler INTEGER NOT NULL DEFAULT 0',
  ]
  for (const sql of newCols) {
    try { await client.execute(sql) } catch {}
  }

  // Добавить sort_order если столбца ещё нет (для уже существующих БД)
  try {
    await client.execute('ALTER TABLE chapters ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')
  } catch {
    // Столбец уже существует — это нормально
  }

  try {
    await client.execute('ALTER TABLE chapters ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1')
  } catch {
    // Столбец уже существует — это нормально
  }

  // Отметка о том, что про главу уже уведомляли в телеграме. При первом
  // добавлении столбца проставляем её всем уже опубликованным главам, чтобы бот
  // не разослал разом уведомления про весь архив. У черновиков она остаётся
  // пустой — про них уведомим тогда, когда их опубликуют.
  try {
    await client.execute('ALTER TABLE chapters ADD COLUMN notified_at TEXT')
    await client.execute('UPDATE chapters SET notified_at = created_at WHERE is_published = 1')
  } catch {
    // Столбец уже существует — это нормально
  }

  // Просмотры по дням — одна строка на главу за день, для счётчика «за сегодня».
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS chapter_view_days (
      chapter_id TEXT NOT NULL,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chapter_id, day)
    );
  `)

  // Прежний журнал хранил строку на каждый адрес ради дедупликации — от неё
  // отказались, адреса больше не пишем.
  try { await client.execute('DROP TABLE chapter_views') } catch {}

  // Хранить историю по дням незачем: показывается только сегодняшний день.
  await client.execute("DELETE FROM chapter_view_days WHERE day < date('now', '-7 day')")

  // Игра «Кто из таверны»: партии игроков и сводка по персонажу дня.
  // Уникальный индекс частичный — партия дня одна на игрока, свободных сколько угодно.
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS game_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('daily','endless')),
      pool TEXT NOT NULL CHECK(pool IN ('known','all')),
      max_volume INTEGER NOT NULL DEFAULT 10,
      day TEXT NOT NULL,
      answer_id TEXT NOT NULL,
      guesses TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'playing' CHECK(status IN ('playing','won','revealed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS game_sessions_daily
      ON game_sessions (player, day) WHERE mode = 'daily';

    CREATE INDEX IF NOT EXISTS game_sessions_player
      ON game_sessions (player, mode, id);

    CREATE TABLE IF NOT EXISTS game_stats (
      day TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('daily','endless')),
      played INTEGER NOT NULL DEFAULT 0,
      won INTEGER NOT NULL DEFAULT 0,
      guesses INTEGER NOT NULL DEFAULT 0,
      win_guesses INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, mode)
    );
  `)

  // Прежние счётчики знали только про персонажа дня и считали заодно нас самих.
  // Игра ещё скрыта, терять нечего — просто выбрасываем старую таблицу.
  try { await client.execute('DROP TABLE game_daily_stats') } catch {}

  // Потолок тома появился позже самой игры — дописываем столбец в уже созданные базы.
  try {
    await client.execute('ALTER TABLE game_sessions ADD COLUMN max_volume INTEGER NOT NULL DEFAULT 10')
  } catch {
    // Столбец уже существует — это нормально
  }

  // Партии, заведённые до появления потолка тома, получили при ALTER значение по
  // умолчанию — десятый том. Такая партия показывает спойлерные колонки и
  // персонажей из непереведённых томов, поэтому разово их выбрасываем. Метка в
  // настройках следит, чтобы уборка случилась один раз и не сносила потом
  // партии живых игроков.
  const reset = await client.execute("SELECT value FROM site_settings WHERE key = 'game_sessions_reset'")
  if (reset.rows.length === 0) {
    await client.execute('DELETE FROM game_sessions')
    await client.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('game_sessions_reset', '1')")
  }

  // Старые партии не нужны: страница показывает только сегодняшнюю и текущую свободную.
  await client.execute("DELETE FROM game_sessions WHERE day < date('now', '-30 day')")

  // Всегда исправлять главы с sort_order = 0 по published_at
  await client.execute(`
    UPDATE chapters SET sort_order = (
      SELECT COUNT(*) FROM chapters c2 WHERE c2.published_at <= chapters.published_at
    ) WHERE sort_order = 0
  `)

  // Вход через Google и телеграм. У таких аккаунтов нет ни почты, ни пароля, а
  // прежняя таблица объявляла оба столбца NOT NULL — снять это ALTER'ом SQLite
  // не умеет, поэтому таблицу разово пересобираем. Метка в настройках следит,
  // чтобы пересборка случилась один раз и не тронула живые строки повторно.
  const usersRebuilt = await client.execute("SELECT value FROM site_settings WHERE key = 'users_nullable_rebuild'")
  if (usersRebuilt.rows.length === 0) {
    // Одной транзакцией вместе с меткой: оборвись процесс между DROP и
    // переименованием — база осталась бы без таблицы пользователей, а метка
    // непоставленной, и следующий запуск падал бы на том же месте. Либо всё,
    // либо ничего.
    await client.batch([
      `CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'reader' CHECK(role IN ('admin','reader')),
        avatar_url TEXT,
        display_name TEXT,
        is_banned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `INSERT INTO users_new (id, email, password_hash, role, avatar_url, display_name)
        SELECT id, email, password_hash, role, avatar_url, display_name FROM users`,
      'DROP TABLE users',
      'ALTER TABLE users_new RENAME TO users',
      "INSERT OR REPLACE INTO site_settings (key, value) VALUES ('users_nullable_rebuild', '1')",
    ], 'write')
  }

  // Способы входа: один аккаунт — сколько угодно провайдеров. Отдельная таблица,
  // а не столбцы в users: иначе третий провайдер потребует новой миграции, а
  // привязать два входа к одному человеку будет нечем.
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS user_identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider TEXT NOT NULL CHECK(provider IN ('google','telegram')),
      provider_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS user_identities_provider
      ON user_identities (provider, provider_user_id);

    CREATE INDEX IF NOT EXISTS user_identities_user
      ON user_identities (user_id);
  `)

  // Закладка вошедшего читателя: прочитанные главы и место в каждой. У гостей
  // всё это лежит в localStorage и там же остаётся — таблица только для тех,
  // кто вошёл, ради того чтобы закладка совпадала на телефоне и на ноутбуке.
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS reading_progress (
      user_id INTEGER NOT NULL,
      chapter_id TEXT NOT NULL,
      scroll REAL NOT NULL DEFAULT 0,
      is_read INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, chapter_id)
    );

    CREATE INDEX IF NOT EXISTS reading_progress_recent
      ON reading_progress (user_id, updated_at);
  `)

  // Дефолтные настройки сайта
  const defaults: Record<string, string> = {
    hero_title: 'Истории трактира,\nрассказанные заново',
    hero_subtitle: 'Продолжение перевода с главы 4.12. Цветное оформление речи персонажей, регулярные обновления, epub для скачивания — глава за главой.',
    ledger_note: 'том.глава — нумерация как в оригинале',
    footer_text: 'Фанатский перевод. Оригинал — wanderinginn.com, автор Pirateaba.\nНекоммерческий проект. Все права на оригинальное произведение принадлежат автору.',
    telegram_url: 'https://t.me/',
    boosty_url: 'https://boosty.to/',
    tribute_url: '',
    error_404_sub: 'Козёл добрался до этой страницы раньше тебя.',
    tg_cta_title: 'Не пропусти новую главу',
    tg_cta_text: 'Бот в телеграм-канале присылает уведомление о каждой новой главе сразу после публикации.',
    update_schedule: '2–3',
    // Пусто — потолок тома для персонажа дня считается по границе перевода.
    // Число здесь означает ручной потолок и границу перевода перебивает.
    game_max_volume: '',
    game_cta_title: 'Кто из таверны?',
    game_cta_text: 'Угадай персонажа по признакам: вид, занятие, том появления. Новый — каждый день, и только те, кто встречался до {том} тома.',
  }

  for (const [key, value] of Object.entries(defaults)) {
    await client.execute({
      sql: 'INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)',
      args: [key, value],
    })
  }

  // Создать admin-аккаунт если нет ни одного пользователя
  const existing = await client.execute('SELECT COUNT(*) as cnt FROM users')
  const count = (existing.rows[0] as any).cnt as number
  if (count === 0) {
    const hash = await bcrypt.hash('admin123', 12)
    await client.execute({
      sql: "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')",
      args: ['admin@tavern.local', hash],
    })
    console.log('[migrate] Admin created: admin@tavern.local / admin123 — смени пароль!')
  }

  client.close()
}
