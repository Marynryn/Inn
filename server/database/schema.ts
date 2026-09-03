import { sql } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
  displayName: text('display_name'),
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

export const comments = sqliteTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chapterId: text('chapter_id'), // NULL = отзыв о сайте
  authorName: text('author_name').notNull(),
  body: text('body').notNull(),
  isSpoiler: integer('is_spoiler', { mode: 'boolean' }).notNull().default(false),
  userId: integer('user_id'), // NULL = гость, иначе — залогиненный пользователь
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

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

export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
})
