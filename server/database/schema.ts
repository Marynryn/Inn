import { sql } from 'drizzle-orm'
import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const chapters = sqliteTable('chapters', {
  id: text('id').primaryKey(), // '4.20'
  volume: integer('volume').notNull(),
  title: text('title').notNull(),
  contentHtml: text('content_html').notNull().default(''),
  epubPath: text('epub_path'), // storage/epubs/4-20.epub
  publishedAt: text('published_at').notNull(), // ISO date string
  sortOrder: integer('sort_order').notNull().default(0),
  isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(true),
  notifiedAt: text('notified_at'), // когда про главу отправили уведомление в телеграм; NULL = ещё не отправляли
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// Почта и пароль необязательны: у входа через Google почта есть, у телеграма её
// нет вовсе, а пароль заводится только у тех, кого создаёт админ.
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  role: text('role', { enum: ['admin', 'reader'] }).notNull().default('reader'),
  avatarUrl: text('avatar_url'),
  // Выбранная рамка вокруг аватарки. NULL = без рамки. Выбрать можно только из
  // выигранных — что выиграно, лежит в user_frames.
  avatarFrameId: integer('avatar_frame_id'),
  displayName: text('display_name'),
  displayNameKey: text('display_name_key'), // имя в одном написании: по нему имена и считаются занятыми
  isBanned: integer('is_banned', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// Привязка аккаунта к способу входа. Один пользователь может держать и Google, и
// телеграм — вход любым из них приводит в тот же профиль.
export const userIdentities = sqliteTable('user_identities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  provider: text('provider', { enum: ['google', 'telegram'] }).notNull(),
  providerUserId: text('provider_user_id').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// Каталог рамок для аватарок. Картинки лежат на диске рядом с аватарками, в
// базе — только имя файла: рамка заводится из админки, и выкатки сайта ради
// новой картинки быть не должно.
export const avatarFrames = sqliteTable('avatar_frames', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  file: text('file').notNull(), // frame-3.webp
  fit: real('fit').notNull().default(0.72), // доля картинки под аватарку
  // Участвует ли рамка в случайной раздаче на ивентах. Снятая с раздачи рамка
  // остаётся у тех, кто её уже выиграл: редкость — это и есть смысл рамки.
  inPool: integer('in_pool', { mode: 'boolean' }).notNull().default(true),
  // Рамка новичка: достаётся при регистрации и сразу надевается. Такая рамка
  // одна на весь сайт — вторая отметка снимает первую.
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// Что человек выиграл. Рамкой можно выбрать только строку отсюда — без этой
// таблицы рамка была бы не наградой, а просто настройкой.
export const userFrames = sqliteTable('user_frames', {
  userId: integer('user_id').notNull(),
  frameId: integer('frame_id').notNull(),
  grantedAt: text('granted_at').notNull().default(sql`(datetime('now'))`),
}, t => [primaryKey({ columns: [t.userId, t.frameId] })])

export const comments = sqliteTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chapterId: text('chapter_id'), // NULL = отзыв о сайте
  authorName: text('author_name').notNull(),
  body: text('body').notNull(),
  isSpoiler: integer('is_spoiler', { mode: 'boolean' }).notNull().default(false),
  userId: integer('user_id'), // NULL = гость, иначе — залогиненный пользователь
  // Ответ на другой комментарий. Ветка одноуровневая: parent_id всегда указывает
  // на корневой комментарий, и ответ на ответ ложится в ту же ветку — иначе на
  // телефоне к четвёртому уровню от текста остаётся столбик в пару слов.
  parentId: integer('parent_id'),
  // Кому именно отвечали. parent_id держит корень ветки — по нему ответ встаёт
  // на место, но из него не узнать, к чьей реплике обращались. Для корневого
  // ответа совпадает с parent_id.
  replyToId: integer('reply_to_id'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// Закладка вошедшего читателя. Строка на главу: дочитал ли и где остановился.
// Последняя глава — та, чья строка обновлялась позже всех.
export const readingProgress = sqliteTable('reading_progress', {
  userId: integer('user_id').notNull(),
  chapterId: text('chapter_id').notNull(),
  scroll: real('scroll').notNull().default(0), // доля прокрутки, 0..1
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, t => [primaryKey({ columns: [t.userId, t.chapterId] })])

export const chapterStats = sqliteTable('chapter_stats', {
  chapterId: text('chapter_id').primaryKey(),
  viewsCount: integer('views_count').notNull().default(0),
  downloadsCount: integer('downloads_count').notNull().default(0),
})

export const commentReactions = sqliteTable('comment_reactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  commentId: integer('comment_id').notNull(),
  type: text('type', { enum: ['like', 'dislike'] }).notNull(),
  userId: integer('user_id'),
  ip: text('ip'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// Просмотры по дням: строка на главу за день, а не на каждого читателя.
// Нужна только для счётчика «за сегодня»; общий итог живёт в chapter_stats.
export const chapterViewDays = sqliteTable('chapter_view_days', {
  chapterId: text('chapter_id').notNull(),
  day: text('day').notNull(), // '2026-08-29', по Москве
  count: integer('count').notNull().default(0),
}, t => [primaryKey({ columns: [t.chapterId, t.day] })])

// Партия в игре «Кто из таверны». Ответ и список попыток живут здесь, а не у
// игрока: браузер знает только разбор своих догадок.
export const gameSessions = sqliteTable('game_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  player: text('player').notNull(), // анонимный ключ из куки
  userId: integer('user_id'), // NULL = играет не входя; проставляется при первом запросе после входа
  mode: text('mode', { enum: ['daily', 'endless'] }).notNull(),
  pool: text('pool', { enum: ['known', 'all'] }).notNull(),
  maxVolume: integer('max_volume').notNull().default(10), // потолок тома: защита от спойлеров
  day: text('day').notNull(), // '2026-08-31', по Москве
  answerId: text('answer_id').notNull(),
  guesses: text('guesses').notNull().default('[]'), // JSON-массив id персонажей
  status: text('status', { enum: ['playing', 'won', 'revealed'] }).notNull().default('playing'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  finishedAt: text('finished_at'),
})

// Счётчики игры по дням и режимам. Партии администраторов сюда не попадают:
// мы сами гоняем игру чаще всех, и в статистике это только мешает.
export const gameStats = sqliteTable('game_stats', {
  day: text('day').notNull(), // '2026-09-01', по Москве
  mode: text('mode', { enum: ['daily', 'endless'] }).notNull(),
  played: integer('played').notNull().default(0),
  won: integer('won').notNull().default(0),
  guesses: integer('guesses').notNull().default(0), // все попытки, включая проигранные партии
  winGuesses: integer('win_guesses').notNull().default(0), // попытки только победителей
}, t => [primaryKey({ columns: [t.day, t.mode] })])

// Завершённая партия вошедшего игрока — то, из чего считается рейтинг. Живёт
// отдельно от game_sessions: те удаляются и чистятся, а достижения должны
// остаться. Партий дня у человека не больше одной в сутки — иначе рейтинг
// накручивался бы перезаходом.
export const gameResults = sqliteTable('game_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  day: text('day').notNull(), // '2026-09-04', по Москве
  mode: text('mode', { enum: ['daily', 'endless'] }).notNull(),
  guesses: integer('guesses').notNull().default(0),
  won: integer('won', { mode: 'boolean' }).notNull().default(false),
  finishedAt: text('finished_at').notNull().default(sql`(datetime('now'))`),
})

// Уведомление читателю: на его комментарий ответили. Храним только кому и о
// каком ответе — имя отвечающего, текст и глава берутся из самого комментария
// при чтении. Так уведомление не расходится с правленым комментарием, а
// удалённый ответ выпадает из списка сам, без сверки двух таблиц.
// Второе событие — выдали рамку. Устроено так же: храним только id рамки,
// имя и картинку берём из каталога при чтении, и удалённая рамка выпадает из
// списка сама.
export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(), // получатель
  type: text('type', { enum: ['reply', 'frame'] }).notNull().default('reply'),
  commentId: integer('comment_id'), // ответ, о котором уведомляем (type = reply)
  frameId: integer('frame_id'), // выданная рамка (type = frame)
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
})
