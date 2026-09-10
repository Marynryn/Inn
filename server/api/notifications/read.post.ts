import { and, eq } from 'drizzle-orm'
import { notifications } from '../../database/schema'
import { useDb } from '../../utils/db'

/**
 * Помечает уведомления прочитанными: одно по id или все сразу, если id не дали.
 *
 * Условие по userId стоит рядом с id не для красоты: без него чужой id в теле
 * запроса гасил бы чужие уведомления.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = (session.user as { id?: number } | undefined)?.id ?? null

  if (!userId) throw createError({ statusCode: 401, message: 'Нужен вход' })

  const body = await readBody<{ id?: number }>(event)
  const db = useDb()

  const id = body?.id != null ? Number(body.id) : null
  if (id != null && !Number.isInteger(id)) {
    throw createError({ statusCode: 400, message: 'Неверный id' })
  }

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(id != null
      ? and(eq(notifications.userId, userId), eq(notifications.id, id))
      : eq(notifications.userId, userId))

  return { ok: true }
})
