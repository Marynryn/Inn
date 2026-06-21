import { useDb } from '../../utils/db'
import { comments } from '../../database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user?.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Нет доступа' })
  }

  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  await db.delete(comments).where(eq(comments.id, id))

  return { ok: true }
})
