import { count, eq } from 'drizzle-orm'
import type { PublicReader } from '#shared/utils/readerProfile'
import { comments, users } from '../../database/schema'
import { useDb } from '../../utils/db'
import { frameById, ownedFrames } from '../../utils/frames'
import { readerName } from '../../utils/identity'
import { skinById } from '../../utils/skins'
import { figureById } from '#shared/utils/nameFigures'

/**
 * Публичная страница читателя. Отдаём только то, что и так видно под его
 * комментариями, плюс коллекцию рамок и «О себе». Заблокированного будто нет:
 * его страница — не место, где стоит что-то показывать.
 *
 * Читатель находится по публичному коду, а не по номеру: номер наружу не
 * выходит вовсе — по нему видно, сколько на сайте читателей.
 */
export default defineEventHandler(async (event): Promise<PublicReader> => {
  const code = String(getRouterParam(event, 'code') ?? '')
  const notFound = () => createError({ statusCode: 404, message: 'Такого читателя нет' })
  if (!/^[0-9a-f]{12}$/.test(code)) throw notFound()

  const db = useDb()
  const [user] = await db.select().from(users).where(eq(users.publicId, code))
  if (!user || user.isBanned) throw notFound()

  const [said] = await db.select({ n: count() }).from(comments).where(eq(comments.userId, user.id))

  // Выигранное, а не то, что можно надеть: хозяйке сайта для примерки виден
  // весь каталог, но в коллекции у неё только своё. Носить можно лишь своё,
  // так что надетая рамка в коллекции есть всегда.
  const frames = (await ownedFrames(user.id)).map(({ owned, grantedAt, ...f }) => ({ ...f, grantedAt: grantedAt! }))

  const session = await getUserSession(event)
  const viewer = session.user as { id?: number, role?: string } | undefined
  const isMe = viewer?.id === user.id

  // Примерка: хозяйка сайта смотрит свою страницу в любом скине каталога, не
  // надевая его. Только на своей и только она — остальные ?skin= не видят.
  const trySkin = Number(getQuery(event).skin)
  const skin = isMe && viewer?.role === 'admin' && Number.isInteger(trySkin) && trySkin > 0
    ? await skinById(trySkin)
    : await skinById(user.skinId)

  return {
    code,
    isMe,
    name: readerName(user),
    avatarUrl: user.avatarUrl,
    avatarFrame: await frameById(user.avatarFrameId),
    about: user.about || null,
    since: user.createdAt,
    comments: said?.n ?? 0,
    frames,
    skin,
    figure: figureById(user.figure),
  }
})
