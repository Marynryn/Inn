import { eq } from 'drizzle-orm'
import { users } from '../../../../database/schema'
import { useDb } from '../../../../utils/db'

/**
 * Стереть чужое «О себе». Страница читателя открыта всем, и если там написали
 * гадость, хозяйке сайта нужно убрать её одной кнопкой, а не через базу.
 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, message: 'Не выбран читатель' })

  const [updated] = await useDb()
    .update(users)
    .set({ about: null })
    .where(eq(users.id, id))
    .returning({ id: users.id })
  if (!updated) throw createError({ statusCode: 404, message: 'Такого читателя нет' })

  return { ok: true }
})
