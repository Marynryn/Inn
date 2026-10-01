import { spin } from '../../utils/reel'

/** Попытка на сегодня. Что выпало, решает сервер — лента в окне лишь доезжает
 *  до ответа, иначе выигрыш можно было бы подделать из браузера. */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session.user as { id?: number, role?: string } | undefined
  if (!user?.id) throw createError({ statusCode: 401, message: 'Крутить могут только вошедшие' })

  return spin(user.id, user.role)
})
