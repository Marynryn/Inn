import { useDb } from '../../utils/db'
import { chapters, comments } from '../../database/schema'
import { count, eq } from 'drizzle-orm'
import { buildChapterDescription } from '#shared/utils/excerpt'

export default defineEventHandler(async (event) => {
  const param = getRouterParam(event, 'id')!
  const db = useDb()

  const id = await resolveChapterId(db, param)
  if (!id) throw createError({ statusCode: 404, message: 'Глава не найдена' })

  // Поля перечислены явно: раньше уходила вся строка, вместе с путём к epub на
  // диске сервера и служебными отметками, которые странице не нужны.
  const [chapter] = await db
    .select({
      id: chapters.id,
      volume: chapters.volume,
      title: chapters.title,
      contentHtml: chapters.contentHtml,
      publishedAt: chapters.publishedAt,
      isPublished: chapters.isPublished,
    })
    .from(chapters)
    .where(eq(chapters.id, id))
  if (!chapter) throw createError({ statusCode: 404, message: 'Глава не найдена' })

  const session = await getUserSession(event)
  if (!chapter.isPublished && session.user?.role !== 'admin') {
    throw createError({ statusCode: 404, message: 'Глава не найдена' })
  }

  // ?text=1 — только текст. Так спрашивает серверный компонент ChapterText:
  // счётчик комментариев и описание для поисковиков ему не нужны, а описание
  // ради этого ещё и вычитывалось из всего текста главы второй раз за показ.
  if (getQuery(event).text === '1') return { contentHtml: chapter.contentHtml }

  // Просмотр здесь больше не считается: этот обработчик отвечает и на серверный
  // рендер, то есть на любой скачанный HTML. Считает /api/chapters/[id]/view,
  // который дёргает уже загруженная страница.

  // Сколько комментариев — для кнопки «Обсуждение главы». Здесь, а не отдельным
  // запросом: страница и так ждёт этот ответ, а счётчик — одно число.
  const [{ commentsCount }] = await db
    .select({ commentsCount: count() })
    .from(comments)
    .where(eq(comments.chapterId, id))

  // Описание для поисковиков считаем здесь: странице главы тогда не нужен сам
  // текст — его рисует серверный компонент ChapterText.
  const description = buildChapterDescription(chapter.id, chapter.contentHtml)

  // ?meta=1 — всё, кроме текста. Так спрашивает страница главы: pick на её
  // стороне выбросил бы текст уже после скачивания, и при переходе стрелкой
  // глава качалась бы дважды — здесь и в острове. Панель и прочие берут целиком.
  if (getQuery(event).meta === '1') {
    const { contentHtml: _, ...meta } = chapter
    return { ...meta, commentsCount, description }
  }

  return { ...chapter, commentsCount, description }
})
