import { eq } from 'drizzle-orm'
import { userIdentities, users } from '../database/schema'
import { useDb } from '../utils/db'
import { frameById, wearableFrames } from '../utils/frames'
import { skinById, wearableSkins } from '../utils/skins'
import { wearableFigures } from '../utils/figures'
import { figureById } from '#shared/utils/nameFigures'

/** Профиль читателя вместе со списком привязанных способов входа. */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const sessionUser = session.user as { id: number } | undefined
  if (!sessionUser?.id) throw createError({ statusCode: 401, message: 'Нужно войти' })

  const db = useDb()
  const [user] = await db.select().from(users).where(eq(users.id, sessionUser.id))
  if (!user) throw createError({ statusCode: 404, message: 'Пользователь не найден' })

  const links = await db
    .select({ provider: userIdentities.provider })
    .from(userIdentities)
    .where(eq(userIdentities.userId, user.id))

  return {
    // Номер — только хозяйке сайта: «выдать себе» в панели идёт по нему. Читателю
    // он выдал бы, сколько людей зарегистрировалось до него.
    id: user.role === 'admin' ? user.id : undefined,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    about: user.about,
    // Код своей публичной страницы — для ссылки «Как меня видят другие».
    publicId: user.publicId,
    avatarFrame: await frameById(user.avatarFrameId),
    // Выигранные рамки — из них человек и выбирает; у хозяйки сайта здесь
    // весь каталог. Пустой список значит, что выбирать не из чего: на странице
    // тогда стоит объяснение, а не список.
    frames: await wearableFrames(user.id, user.role === 'admin'),
    // Скин страницы — надетый и из чего выбирать; у хозяйки сайта, как и с
    // рамками, весь каталог для примерки.
    skin: await skinById(user.skinId),
    skins: await wearableSkins(user.id, user.role === 'admin'),
    // Фигурка у имени — так же: надетая и из чего выбирать.
    figure: figureById(user.figure),
    figures: await wearableFigures(user.id, user.role === 'admin'),
    hasPassword: Boolean(user.passwordHash),
    providers: links.map(l => l.provider),
  }
})
