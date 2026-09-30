import { count, eq } from 'drizzle-orm'
import type { PublicReader } from '#shared/utils/readerProfile'
import { comments, users } from '../../database/schema'
import { useDb } from '../../utils/db'
import { frameById, ownedFrames } from '../../utils/frames'
import { readerName } from '../../utils/identity'

/**
 * Публичная страница читателя. Отдаём только то, что и так видно под его
 * комментариями, плюс коллекцию рамок и «О себе». Заблокированного будто нет:
 * его страница — не место, где стоит что-то показывать.
 */
export default defineEventHandler(async (event): Promise<PublicReader> => {
  const id = Number(getRouterParam(event, 'id'))
  const notFound = () => createError({ statusCode: 404, message: 'Такого читателя нет' })
  if (!Number.isInteger(id) || id <= 0) throw notFound()

  const db = useDb()
  const [user] = await db.select().from(users).where(eq(users.id, id))
  if (!user || user.isBanned) throw notFound()

  const [said] = await db.select({ n: count() }).from(comments).where(eq(comments.userId, id))

  // Выигранное, а не то, что можно надеть: хозяйке сайта для примерки виден
  // весь каталог, но в коллекции у неё только своё. Носить можно лишь своё,
  // так что надетая рамка в коллекции есть всегда.
  const frames = (await ownedFrames(id)).map(({ owned, grantedAt, ...f }) => ({ ...f, grantedAt: grantedAt! }))

  return {
    id: user.id,
    name: readerName(user),
    avatarUrl: user.avatarUrl,
    avatarFrame: await frameById(user.avatarFrameId),
    about: user.about || null,
    since: user.createdAt,
    comments: said?.n ?? 0,
    frames,
  }
})
