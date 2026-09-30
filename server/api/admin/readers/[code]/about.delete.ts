import { eq } from 'drizzle-orm'
import { users } from '../../../../database/schema'
import { useDb } from '../../../../utils/db'

/**
 * Стереть чужое «О себе». Страница читателя открыта всем, и если там написали
 * гадость, хозяйке сайта нужно убрать её одной кнопкой, а не через базу.
 * Читатель — по публичному коду, как и на самой странице.
 */
export default defineEventHandler(async (event) => {
  const code = String(getRouterParam(event, 'code') ?? '')
  if (!/^[0-9a-f]{12}$/.test(code)) throw createError({ statusCode: 400, message: 'Не выбран читатель' })

  const [updated] = await useDb()
    .update(users)
    .set({ about: null })
    .where(eq(users.publicId, code))
    .returning({ id: users.id })
  if (!updated) throw createError({ statusCode: 404, message: 'Такого читателя нет' })

  return { ok: true }
})
