import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'
import { DISPLAY_NAME_MAX, displayNameKey, nameFromEmail, normalizeDisplayName } from '#shared/utils/displayName'
import { countWords } from '#shared/utils/wordCount'

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
    // Ответ на комментарий. Ветка одноуровневая: здесь всегда id корневого.
    'ALTER TABLE comments ADD COLUMN parent_id INTEGER',
    // Кому отвечали. У ответов, написанных до этого столбца, останется NULL —
    // тогда подпись «в ответ» просто не показывается, а ветка цела.
    'ALTER TABLE comments ADD COLUMN reply_to_id INTEGER',
  ]
  for (const sql of newCols) {
    try { await client.execute(sql) } catch {}
  }

  // Ответы читаются веткой: без индекса каждый показ главы сканировал бы
  // всю таблицу комментариев ради нескольких строк.
  await client.execute(
    'CREATE INDEX IF NOT EXISTS comments_parent ON comments (parent_id)'
  )

  // Уведомления: «на твой комментарий ответили». Держим только получателя и id
  // ответа — остальное достаётся из самого комментария при чтении.
  //
  // Уникальность по паре (получатель, ответ) — от повторной записи: один ответ
  // порождает ровно одно уведомление, сколько бы раз обработчик ни сработал.
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      comment_id INTEGER NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS notifications_once
      ON notifications (user_id, comment_id);

    CREATE INDEX IF NOT EXISTS notifications_unread
      ON notifications (user_id, is_read);
  `)

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

  // Длина главы в словах — для трекера прогресса. Новые главы считаются при
  // сохранении, а уже загруженные досчитываем здесь: по одной, чтобы не
  // поднимать в память весь перевод разом. Глава с нулём слов при пустом
  // тексте пересчитается на каждом старте — это один дешёвый запрос.
  try {
    await client.execute('ALTER TABLE chapters ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0')
  } catch {
    // Столбец уже существует — это нормально
  }
  const uncounted = await client.execute("SELECT id FROM chapters WHERE word_count = 0 AND content_html != ''")
  for (const row of uncounted.rows) {
    const id = (row as any).id as string
    const chapter = await client.execute({ sql: 'SELECT content_html FROM chapters WHERE id = ?', args: [id] })
    const html = ((chapter.rows[0] as any)?.content_html ?? '') as string
    await client.execute({ sql: 'UPDATE chapters SET word_count = ? WHERE id = ?', args: [countWords(html), id] })
  }
  if (uncounted.rows.length) console.log(`[migrate] Посчитаны слова в главах: ${uncounted.rows.length}`)

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

  // Достижения в игре. Отдельная таблица, а не выборка по партиям: свободные
  // партии удаляются при старте следующей, а всё старше месяца вычищается —
  // истории игрока в game_sessions не остаётся вовсе. Здесь строка на
  // завершённую партию, и она переживает обе чистки.
  //
  // Партий дня у человека не может быть больше одной в сутки: без этого рейтинг
  // накручивался бы перезаходом.
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS game_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('daily','endless')),
      guesses INTEGER NOT NULL DEFAULT 0,
      won INTEGER NOT NULL DEFAULT 0,
      finished_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS game_results_daily
      ON game_results (user_id, day) WHERE mode = 'daily';

    CREATE INDEX IF NOT EXISTS game_results_user
      ON game_results (user_id, finished_at);
  `)

  // Партия, начатая до входа, должна засчитаться тому, кто потом вошёл.
  try {
    await client.execute('ALTER TABLE game_sessions ADD COLUMN user_id INTEGER')
  } catch {
    // Столбец уже существует — это нормально
  }

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

  // Имя под комментариями — одно на всех. Рядом с самим именем теперь лежит его
  // ключ (написание, приведённое к одному виду), а уникальный индекс по ключу и
  // держит правило. Тем, кто подписывался почтой, имя проставляем явно: пока оно
  // только выводилось из почты, занятым оно не считалось и его мог взять кто-то
  // ещё. Совпавшие имена разводим номером — прежнее остаётся тому, кто раньше.
  const nameKeys = await client.execute("SELECT value FROM site_settings WHERE key = 'display_name_keys'")
  if (nameKeys.rows.length === 0) {
    try { await client.execute('ALTER TABLE users ADD COLUMN display_name_key TEXT') } catch {}

    // Имя, выбранное руками, старше выведенного из почты: раздаём сперва тем,
    // кто называл себя сам, и только потом остальным. Иначе служебный
    // admin@tavern.local — он заводится сам при пустой базе и имени никогда не
    // выбирал — отобрал бы «admin» у живого человека.
    const rows = await client.execute('SELECT id, display_name, email FROM users ORDER BY id')
    const ordered = [...rows.rows].sort((a, b) =>
      Number(Boolean(b.display_name)) - Number(Boolean(a.display_name)))
    const taken = new Set<string>()

    for (const row of ordered as unknown as { id: number, display_name: string | null, email: string | null }[]) {
      const base = normalizeDisplayName(row.display_name) || nameFromEmail(row.email)
      if (!base) continue

      let name = base
      for (let n = 2; taken.has(displayNameKey(name)); n++) {
        const suffix = ` ${n}`
        name = normalizeDisplayName(base.slice(0, DISPLAY_NAME_MAX - suffix.length) + suffix)
      }
      taken.add(displayNameKey(name))

      await client.execute({
        sql: 'UPDATE users SET display_name = ?, display_name_key = ? WHERE id = ?',
        args: [name, displayNameKey(name), row.id],
      })
    }

    await client.executeMultiple(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_display_name_key
        ON users (display_name_key) WHERE display_name_key IS NOT NULL;
    `)
    await client.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('display_name_keys', '1')")
  }

  // Разбор выше уже прошёл по боевой базе в прежнем порядке — по одному
  // старшинству id, — и служебный admin@tavern.local успел отобрать «admin» у
  // хозяйки сайта: ей осталось «admin 2». Возвращаем имя тому, кто его
  // выбирал: у кого имя лишь выведено из почты, тот уступает его владельцу
  // номерного двойника, а сам получает двойника взамен.
  const nameOwners = await client.execute("SELECT value FROM site_settings WHERE key = 'display_name_owner_fix'")
  if (nameOwners.rows.length === 0) {
    type NameRow = { id: number, email: string | null, role: string, display_name: string | null, display_name_key: string | null }
    const all = await client.execute('SELECT id, email, role, display_name, display_name_key FROM users ORDER BY id')
    const rows = all.rows as unknown as NameRow[]

    for (const holder of rows) {
      const key = holder.display_name_key
      if (!key) continue

      // Имя выбрано руками — оно и так у своего человека.
      const fromMail = nameFromEmail(holder.email)
      if (!fromMail || displayNameKey(fromMail) !== key) continue

      // Тот, кому это же имя досталось с номером, и есть тот, кто его выбирал.
      // Только хозяйка сайта: чужие профили разово не переставляем, а если
      // номерное имя досталось постороннему — имя тем более остаётся здесь.
      const claimant = rows.find(r => r.id !== holder.id
        && r.role === 'admin'
        && /^ \d+$/.test((r.display_name_key ?? '').slice(key.length))
        && (r.display_name_key ?? '').startsWith(`${key} `))
      if (!claimant) continue

      const wanted = normalizeDisplayName((claimant.display_name ?? '').replace(/ \d+$/, ''))
      const given = claimant.display_name!
      if (!wanted) continue

      // По одному шагу: уникальный индекс не даст двум строкам сойтись на одном
      // ключе даже на миг, поэтому сначала освобождаем имя, а потом раздаём.
      await client.batch([
        { sql: 'UPDATE users SET display_name = NULL, display_name_key = NULL WHERE id = ?', args: [holder.id] },
        { sql: 'UPDATE users SET display_name = ?, display_name_key = ? WHERE id = ?', args: [wanted, displayNameKey(wanted), claimant.id] },
        { sql: 'UPDATE users SET display_name = ?, display_name_key = ? WHERE id = ?', args: [given, displayNameKey(given), holder.id] },
      ], 'write')

      holder.display_name = given
      holder.display_name_key = displayNameKey(given)
      claimant.display_name = wanted
      claimant.display_name_key = displayNameKey(wanted)
    }

    await client.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('display_name_owner_fix', '1')")
  }

  // Рамки для аватарок. Каталог в базе, картинки на диске: рамки раздаются на
  // ивентах, и новая рамка не должна требовать выкатки сайта.
  //
  // Владение отдельной таблицей, а не флагом у пользователя: выбрать рамкой
  // можно только выигранную, и список выигранных — это и есть награда.
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS avatar_frames (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      file TEXT NOT NULL,
      fit REAL NOT NULL DEFAULT 0.72,
      in_pool INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_frames (
      user_id INTEGER NOT NULL,
      frame_id INTEGER NOT NULL,
      granted_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, frame_id)
    );

    CREATE INDEX IF NOT EXISTS user_frames_frame ON user_frames (frame_id);
  `)

  try {
    await client.execute('ALTER TABLE users ADD COLUMN avatar_frame_id INTEGER')
  } catch {
    // Столбец уже существует — это нормально
  }

  // Рамка новичка: её выдают при регистрации и сразу надевают.
  try {
    await client.execute('ALTER TABLE avatar_frames ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0')
  } catch {
    // Столбец уже существует — это нормально
  }

  // Уведомление о выданной рамке. Таблица уведомлений была привязана к
  // комментарию намертво — comment_id NOT NULL, — а у рамки комментария нет.
  // Снять NOT NULL в SQLite можно только перестройкой, поэтому перестраиваем:
  // тип события, необязательный comment_id и frame_id для рамки. Прежние
  // строки переезжают как есть, с типом reply.
  //
  // Уникальность — своя на каждый тип: об одном ответе не уведомляем дважды,
  // об одной рамке тоже. Индексы частичные: у ответа пуст frame_id, у рамки —
  // comment_id, и в общем индексе они бы друг другу не мешали, но частичный
  // говорит это прямо.
  const notifRebuilt = await client.execute("SELECT value FROM site_settings WHERE key = 'notifications_frame_rebuild'")
  if (notifRebuilt.rows.length === 0) {
    await client.batch([
      `CREATE TABLE notifications_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL DEFAULT 'reply' CHECK(type IN ('reply','frame')),
        comment_id INTEGER,
        frame_id INTEGER,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `INSERT INTO notifications_new (id, user_id, type, comment_id, is_read, created_at)
        SELECT id, user_id, 'reply', comment_id, is_read, created_at FROM notifications`,
      'DROP TABLE notifications',
      'ALTER TABLE notifications_new RENAME TO notifications',
      `CREATE UNIQUE INDEX IF NOT EXISTS notifications_once
        ON notifications (user_id, comment_id) WHERE comment_id IS NOT NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS notifications_frame_once
        ON notifications (user_id, frame_id) WHERE frame_id IS NOT NULL`,
      'CREATE INDEX IF NOT EXISTS notifications_unread ON notifications (user_id, is_read)',
      "INSERT OR REPLACE INTO site_settings (key, value) VALUES ('notifications_frame_rebuild', '1')",
    ], 'write')
  }

  // Дефолтные настройки сайта
  const defaults: Record<string, string> = {
    hero_title: 'Истории трактира,\nрассказанные заново',
    hero_subtitle: 'Продолжение перевода с главы 4.12. Цветное оформление речи персонажей, регулярные обновления, epub для скачивания — глава за главой.',
    // Бегущая строка под hero, по фразе на строку. Зазыв завести аккаунт —
    // видят её только незарегистрированные.
    hero_ticker: 'В таверне завели книгу постояльцев\nЗаведи аккаунт — закладка будет на всех устройствах\nОтветят на комментарий — придёт уведомление\nВход через Google или Telegram, за полминуты',
    hero_ticker_on: '1',
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
      sql: "INSERT INTO users (email, password_hash, role, display_name, display_name_key) VALUES (?, ?, 'admin', ?, ?)",
      args: ['admin@tavern.local', hash, 'admin', 'admin'],
    })
    console.log('[migrate] Admin created: admin@tavern.local / admin123 — смени пароль!')
  }

  client.close()
}
