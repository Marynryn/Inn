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

  // Всегда исправлять главы с sort_order = 0 по published_at
  await client.execute(`
    UPDATE chapters SET sort_order = (
      SELECT COUNT(*) FROM chapters c2 WHERE c2.published_at <= chapters.published_at
    ) WHERE sort_order = 0
  `)

  // Дефолтные настройки сайта
  const defaults: Record<string, string> = {
    hero_title: 'Истории трактира,\nрассказанные заново',
    hero_subtitle: 'Продолжение перевода с главы 4.12. Цветное оформление речи персонажей, регулярные обновления, epub для скачивания — глава за главой.',
    ledger_note: 'том.глава — нумерация как в оригинале',
    footer_text: 'Фанатский перевод. Оригинал — wanderinginn.com, автор Pirateaba.\nНекоммерческий проект. Все права на оригинальное произведение принадлежат автору.',
    telegram_url: 'https://t.me/',
    support_url: 'https://buymeacoffee.com/',
    error_404_sub: 'Козёл добрался до этой страницы раньше тебя.',
    update_schedule: '2–3',
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
