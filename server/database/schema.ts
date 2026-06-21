import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const chapters = sqliteTable('chapters', {
  id: text('id').primaryKey(), // '4.20'
  volume: integer('volume').notNull(),
  title: text('title').notNull(),
  contentHtml: text('content_html').notNull().default(''),
  epubPath: text('epub_path'), // storage/epubs/4-20.epub
  publishedAt: text('published_at').notNull(), // ISO date string
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'reader'] }).notNull().default('reader'),
  avatarUrl: text('avatar_url'),
  displayName: text('display_name'),
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

export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
})
