import { useDb } from '../../utils/db'
import { chapters } from '../../database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const param = getRouterParam(event, 'id')!
  const db = useDb()

  const id = await resolveChapterId(db, param)
  if (!id) throw createError({ statusCode: 404, message: 'Глава не найдена' })

  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, id))
  if (!chapter) throw createError({ statusCode: 404, message: 'Глава не найдена' })

  const session = await getUserSession(event)
  if (!chapter.isPublished && session.user?.role !== 'admin') {
    throw createError({ statusCode: 404, message: 'Глава не найдена' })
  }

  // Просмотр здесь больше не считается: этот обработчик отвечает и на серверный
  // рендер, то есть на любой скачанный HTML. Считает /api/chapters/[id]/view,
  // который дёргает уже загруженная страница.
  return chapter
})
