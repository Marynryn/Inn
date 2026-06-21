import { useDb } from '../../utils/db'
import { users } from '../../database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const sessionUser = session.user as { id: number; role: string } | undefined
  if(!sessionUser?.id || sessionUser.role !== 'admin'){
    throw createError({ statusCode: 403, message: 'Нет доступа' })
  }

  const db = useDb()
  const [user] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, sessionUser.id))

  return user ?? null
})
