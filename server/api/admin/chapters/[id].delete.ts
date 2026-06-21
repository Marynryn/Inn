import { useDb } from '../../../utils/db'
import { chapters, chapterStats } from '../../../database/schema'
import { eq } from 'drizzle-orm'
import { unlink } from 'fs/promises'
import { resolve } from 'path'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user?.role !== 'admin') throw createError({ statusCode: 403 })

  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const [chapter] = await db.select({ epubPath: chapters.epubPath }).from(chapters).where(eq(chapters.id, id))
  if (!chapter) throw createError({ statusCode: 404, message: 'Глава не найдена' })

  if (chapter.epubPath) {
    try { await unlink(resolve(chapter.epubPath)) } catch {}
  }

  await db.delete(chapterStats).where(eq(chapterStats.chapterId, id))
  await db.delete(chapters).where(eq(chapters.id, id))

  return { ok: true }
})
