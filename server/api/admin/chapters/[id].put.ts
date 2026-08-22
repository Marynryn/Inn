import { useDb } from '../../../utils/db'
import { chapters } from '../../../database/schema'
import { eq } from 'drizzle-orm'
import { sanitizeChapterHtml } from '../../../utils/epub-parser'
import { buildEpub } from '../../../utils/epub-writer'
import { writeFile, mkdir } from 'fs/promises'
import { resolve } from 'path'
import { getStorageDir } from '../../../utils/storage'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user?.role !== 'admin') throw createError({ statusCode: 403, message: 'Нет доступа' })

  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  if (typeof body?.contentHtml !== 'string') {
    throw createError({ statusCode: 400, message: 'Нужно поле contentHtml' })
  }

  const db = useDb()

  const [existing] = await db.select({ id: chapters.id, title: chapters.title, epubPath: chapters.epubPath }).from(chapters).where(eq(chapters.id, id))
  if (!existing) throw createError({ statusCode: 404, message: 'Глава не найдена' })

  const contentHtml = sanitizeChapterHtml(body.contentHtml)
  const isPublished = typeof body.isPublished === 'boolean' ? body.isPublished : undefined
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : existing.title

  let publishedAt: string | undefined
  if (typeof body.publishedAt === 'string' && body.publishedAt.trim()) {
    publishedAt = body.publishedAt.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) {
      throw createError({ statusCode: 400, message: 'Дата публикации должна быть в формате ГГГГ-ММ-ДД' })
    }
  }

  // Перегенерировать epub-файл, чтобы скачиваемая версия совпадала с текстом на сайте
  // (иначе он остаётся тем, что был загружен изначально, и расходится с правкой).
  const epubDir = resolve(getStorageDir(), 'epubs')
  await mkdir(epubDir, { recursive: true })
  const safeName = slugifyChapterId(id)
  const epubPath = existing.epubPath || resolve(epubDir, `${safeName}.epub`)
  const epubBuffer = await buildEpub({ id, title, contentHtml })
  await writeFile(epubPath, epubBuffer)

  await db.update(chapters).set({
    title,
    contentHtml,
    epubPath,
    ...(isPublished !== undefined && { isPublished }),
    ...(publishedAt !== undefined && { publishedAt }),
  }).where(eq(chapters.id, id))

  return { ok: true }
})
