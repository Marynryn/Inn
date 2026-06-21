import { useDb } from '../../utils/db'
import { chapters, chapterStats } from '../../database/schema'
import { parseEpub } from '../../utils/epub-parser'
import { writeFile, mkdir } from 'fs/promises'
import { resolve } from 'path'
import { getStorageDir } from '../../utils/storage'
import { max } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user?.role !== 'admin') throw createError({ statusCode: 403 })

  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, message: 'Нет данных формы' })

  const get = (name: string) => form.find(f => f.name === name)

  const epubField = get('epub')
  const idField = get('id')
  const titleField = get('title')
  const publishedAtField = get('publishedAt')
  const volumeField = get('volume')

  if (!epubField?.data || !idField || !titleField || !publishedAtField || !volumeField) {
    throw createError({ statusCode: 400, message: 'Нужны: epub, id, title, publishedAt, volume' })
  }

  const id = idField.data.toString().trim()
  const title = titleField.data.toString().trim()
  const publishedAt = publishedAtField.data.toString().trim()
  const volume = Number(volumeField.data.toString())

  const contentHtml = await parseEpub(epubField.data as Buffer)

  // Сохранить epub-файл
  const epubDir = resolve(getStorageDir(), 'epubs')
  await mkdir(epubDir, { recursive: true })
  const safeName = id.replace('.', '-')
  const epubPath = resolve(epubDir, `${safeName}.epub`)
  await writeFile(epubPath, epubField.data)

  const db = useDb()

  const [{ maxOrder }] = await db.select({ maxOrder: max(chapters.sortOrder) }).from(chapters)
  const sortOrder = (maxOrder ?? 0) + 1

  await db
    .insert(chapters)
    .values({ id, volume, title, contentHtml, epubPath, publishedAt, sortOrder })
    .onConflictDoUpdate({
      target: chapters.id,
      set: { volume, title, contentHtml, epubPath, publishedAt },
    })

  await db
    .insert(chapterStats)
    .values({ chapterId: id, viewsCount: 0, downloadsCount: 0 })
    .onConflictDoNothing()

  return { ok: true, id }
})
