import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import bcrypt from 'bcryptjs'
import { count, eq } from 'drizzle-orm'
import { closeDb, useDb } from '../db'
import { chapters, chapterStats, comments, readingProgress, siteSettings, users } from '../../database/schema'
import { buildEpub } from '../epub-writer'
import { getStorageDir } from '../storage'
import { runMigrations } from '../migrate'
import { slugifyChapterId } from '../../../shared/utils/slug'
import { countWords } from '../../../shared/utils/wordCount'
import { displayNameKey } from '../../../shared/utils/displayName'
import { DEMO_ACCOUNTS } from '../../../shared/utils/demo'
import { DEMO_BOOK, DEMO_COMMENTS, DEMO_SETTINGS, type DemoComment } from './book'

/*
  Демо-стенд для покупателей: тот же сайт, но с выдуманной книгой, общим входом
  в панель и сбросом к исходному виду каждую ночь. Включается переменной
  NUXT_PUBLIC_DEMO=true у отдельного сервиса.

  Сброс стирает папку хранилища целиком — базу, epub, аватарки, — поэтому
  проверка здесь двойная: и настройка демо, и адрес сайта не боевой. Один
  перепутанный флажок не должен стоить Таверне всех глав и читателей.
*/
const LIVE_HOSTS = ['taverna-book.com', 'taverna-book.ru', 'inn.taverna-book.ru']

export function isDemo(): boolean {
  const config = useRuntimeConfig()
  if (config.public.demo !== true) return false
  let host = ''
  try {
    host = new URL(config.public.siteUrl).hostname
  } catch {}
  if (LIVE_HOSTS.includes(host)) {
    console.error(`[demo] режим демо включён на боевом адресе ${host} — игнорирую`)
    return false
  }
  return true
}

const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)
// Формат datetime('now') из SQLite: так же лежат даты, записанные самой базой.
const stamp = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString().replace('T', ' ').slice(0, 19)
const html = (paragraphs: string[]) => paragraphs.map(p => `<p>${p}</p>`).join('\n')

/** Наполняет пустой стенд. Если главы уже есть — ничего не трогает. */
export async function seedDemo(): Promise<boolean> {
  const db = useDb()
  const [{ n }] = await db.select({ n: count() }).from(chapters) as [{ n: number }]
  if (n > 0) return false

  // ── Люди ─────────────────────────────────────────────────────────────
  // Миграция на пустой базе заводит служебного админа с известным паролем.
  // Здесь он становится демо-админом, чьи логин и пароль печатает страница входа.
  const hash = (pw: string) => bcrypt.hash(pw, 10)
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1)
  const adminValues = {
    email: DEMO_ACCOUNTS.admin.email,
    passwordHash: await hash(DEMO_ACCOUNTS.admin.password),
    displayName: DEMO_ACCOUNTS.admin.name,
    displayNameKey: displayNameKey(DEMO_ACCOUNTS.admin.name),
  }
  const adminId = admin
    ? (await db.update(users).set(adminValues).where(eq(users.id, admin.id)), admin.id)
    : (await db.insert(users).values({ ...adminValues, role: 'admin' }).returning({ id: users.id }))[0]!.id

  const addReader = async (email: string, password: string, name: string, about: string | null = null) => {
    const [row] = await db.insert(users).values({
      email,
      passwordHash: await hash(password),
      role: 'reader',
      displayName: name,
      displayNameKey: displayNameKey(name),
      about,
    }).returning({ id: users.id })
    return row!.id
  }
  const people: Record<DemoComment['author'], { id: number, name: string }> = {
    admin: { id: adminId, name: DEMO_ACCOUNTS.admin.name },
    reader: { id: await addReader(DEMO_ACCOUNTS.reader.email, DEMO_ACCOUNTS.reader.password, DEMO_ACCOUNTS.reader.name, 'Читаю по вечерам, люблю истории про трактиры.'), name: DEMO_ACCOUNTS.reader.name },
    // У остальных читателей пароль случайный: войти за них нельзя, они тут для живых обсуждений.
    mila: { id: await addReader('mila@demo.local', crypto.randomUUID(), 'Мила'), name: 'Мила' },
    wanderer: { id: await addReader('wanderer@demo.local', crypto.randomUUID(), 'Странник'), name: 'Странник' },
  }

  // ── Настройки ────────────────────────────────────────────────────────
  for (const [key, value] of Object.entries(DEMO_SETTINGS)) {
    await db.insert(siteSettings).values({ key, value })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value } })
  }

  // ── Главы ────────────────────────────────────────────────────────────
  const epubDir = resolve(getStorageDir(), 'epubs')
  await mkdir(epubDir, { recursive: true })

  for (const [i, ch] of DEMO_BOOK.entries()) {
    const contentHtml = html(ch.paragraphs)
    const epubPath = resolve(epubDir, `${slugifyChapterId(ch.id)}.epub`)
    await writeFile(epubPath, await buildEpub({ id: ch.id, title: ch.title, contentHtml }))
    await db.insert(chapters).values({
      id: ch.id,
      volume: ch.volume,
      title: ch.title,
      contentHtml,
      wordCount: countWords(contentHtml),
      epubPath,
      publishedAt: day(ch.daysAgo),
      sortOrder: i + 1,
      isPublished: ch.published,
      // Опубликованные — «уже разосланы»: иначе рассылка сочла бы их новыми.
      notifiedAt: ch.published ? stamp(ch.daysAgo * 24) : null,
    })
    // Старые главы читали дольше — у них и просмотров больше.
    const views = ch.published ? 30 + ch.daysAgo * 9 + (i * 17) % 23 : 0
    await db.insert(chapterStats).values({ chapterId: ch.id, viewsCount: views, downloadsCount: Math.round(views / 6) })
  }

  // ── Обсуждения ───────────────────────────────────────────────────────
  // Ветка одноуровневая: parent_id — корень ветки, reply_to_id — кому отвечали.
  const ids: number[] = []
  const roots: number[] = []
  for (const [i, c] of DEMO_COMMENTS.entries()) {
    const author = people[c.author]
    const replyTo = c.replyTo !== undefined ? ids[c.replyTo]! : null
    const root = c.replyTo !== undefined ? roots[c.replyTo]! : null
    const [row] = await db.insert(comments).values({
      chapterId: c.chapter,
      authorName: author.name,
      body: c.body,
      isSpoiler: c.spoiler ?? false,
      userId: author.id,
      parentId: root,
      replyToId: replyTo,
      createdAt: stamp(c.hoursAgo),
    }).returning({ id: comments.id })
    ids[i] = row!.id
    roots[i] = root ?? row!.id
  }

  // ── Закладка демо-читателя ───────────────────────────────────────────
  // Читатель дочитал первый том и остановился в середине 2.00 — после входа
  // видно и отметки «прочитано», и прогресс, и куда вернуться.
  const published = DEMO_BOOK.filter(ch => ch.published)
  const stopAt = published.findIndex(ch => ch.id === '2.00')
  for (const [i, ch] of published.slice(0, stopAt + 1).entries()) {
    await db.insert(readingProgress).values({
      userId: people.reader.id,
      chapterId: ch.id,
      isRead: i < stopAt,
      scroll: i < stopAt ? 1 : 0.45,
      updatedAt: stamp((stopAt - i) * 20 + 2),
    })
  }

  console.log(`[demo] стенд наполнен: ${DEMO_BOOK.length} глав, ${DEMO_COMMENTS.length} комментариев`)
  return true
}

/**
 * Вернуть стенд к исходному виду: стереть хранилище, как у нового сервера, и
 * наполнить заново. Миграции рассчитаны именно на пустую базу, поэтому
 * чистим не таблицы по одной, а всё разом.
 */
export async function resetDemo(): Promise<void> {
  if (!isDemo()) throw new Error('resetDemo: сайт не в режиме демо')
  closeDb()
  const dir = getStorageDir()
  await mkdir(dir, { recursive: true })
  for (const entry of await readdir(dir)) {
    await rm(resolve(dir, entry), { recursive: true, force: true })
  }
  await runMigrations()
  await seedDemo()
  console.log('[demo] стенд сброшен к исходному виду')
}
