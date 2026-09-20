import { useDb } from '../../utils/db'
import { chapters, chapterStats } from '../../database/schema'
import { parseEpub } from '../../utils/epub-parser'
import { writeFile, mkdir } from 'fs/promises'
import { resolve } from 'path'
import { getStorageDir } from '../../utils/storage'
import { asc, eq } from 'drizzle-orm'
import { countWords } from '#shared/utils/wordCount'

/**
 * Возвращает sortOrder для главы id. Уже загруженная глава остаётся на своём
 * месте. Новая встаёт в конец своего тома — после последней главы с таким же
 * или меньшим номером тома, — а всё, что ниже, сдвигается на единицу. По номеру
 * главы место не угадать: интерлюдии («I.2.2») и побочные истории («1.00 C» в
 * томе 2) стоят там, куда их поставили руками в панели; а вот в конец своего
 * тома они ложатся верно, потому что главы и грузятся по порядку чтения.
 * Список заодно перенумеровывается подряд — дубли и дыры в sortOrder делают
 * порядок в выдаче случайным.
 */
async function placeChapter(db: ReturnType<typeof useDb>, id: string, volume: number) {
  const rows = await db
    .select({ id: chapters.id, volume: chapters.volume, sortOrder: chapters.sortOrder })
    .from(chapters)
    .orderBy(asc(chapters.sortOrder))

  const existing = rows.find(r => r.id === id)
  if (existing) return existing.sortOrder

  let at = 0
  rows.forEach((r, i) => {
    if (r.volume <= volume) at = i + 1
  })

  for (let i = 0; i < rows.length; i++) {
    const wanted = i < at ? i + 1 : i + 2
    if (rows[i]!.sortOrder !== wanted) {
      await db.update(chapters).set({ sortOrder: wanted }).where(eq(chapters.id, rows[i]!.id))
    }
  }
  return at + 1
}

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
  const isPublishedField = get('isPublished')

  if (!epubField?.data || !idField || !titleField || !publishedAtField || !volumeField) {
    throw createError({ statusCode: 400, message: 'Нужны: epub, id, title, publishedAt, volume' })
  }

  const id = idField.data.toString().trim()
  const title = titleField.data.toString().trim()
  const publishedAt = publishedAtField.data.toString().trim()
  const volume = Number(volumeField.data.toString())
  const isPublished = isPublishedField ? isPublishedField.data.toString().trim() === '1' : true

  let contentHtml: string
  try {
    contentHtml = await parseEpub(epubField.data as Buffer)
  } catch {
    throw createError({
      statusCode: 400,
      message: 'Файл повреждён или загрузился не полностью. Если выбирали его прямо из окна Google Диска — сначала скачайте epub на устройство, а потом загрузите его из локальных файлов.',
    })
  }

  // Сохранить epub-файл
  const epubDir = resolve(getStorageDir(), 'epubs')
  await mkdir(epubDir, { recursive: true })
  const safeName = slugifyChapterId(id)
  const epubPath = resolve(epubDir, `${safeName}.epub`)
  await writeFile(epubPath, epubField.data)

  const db = useDb()
  const wordCount = countWords(contentHtml)

  // Новая глава встаёт в конец своего тома, а не всего списка: иначе глава
  // второго тома, загруженная после четвёртого, оказывалась последней — и
  // навигация «← →» с оглавлением, которые идут по sortOrder, вели через тома.
  const sortOrder = await placeChapter(db, id, volume)

  await db
    .insert(chapters)
    .values({ id, volume, title, contentHtml, wordCount, epubPath, publishedAt, sortOrder, isPublished })
    .onConflictDoUpdate({
      target: chapters.id,
      set: { volume, title, contentHtml, wordCount, epubPath, publishedAt, isPublished },
    })

  await db
    .insert(chapterStats)
    .values({ chapterId: id, viewsCount: 0, downloadsCount: 0 })
    .onConflictDoNothing()

  return { ok: true, id }
})
