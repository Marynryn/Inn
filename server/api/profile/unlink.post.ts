import { and, eq } from 'drizzle-orm'
import { userIdentities, users } from '../../database/schema'
import { useDb } from '../../utils/db'

/**
 * Отвязать способ входа. Последний отвязать нельзя: у аккаунта из соцсети нет
 * пароля, и человек попросту потерял бы вход в собственный профиль.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const sessionUser = session.user as { id: number } | undefined
  if (!sessionUser?.id) throw createError({ statusCode: 401, message: 'Нужно войти' })

  const { provider } = await readBody(event)
  if (provider !== 'google' && provider !== 'telegram') {
    throw createError({ statusCode: 400, message: 'Неизвестный способ входа' })
  }

  const db = useDb()
  const [user] = await db.select().from(users).where(eq(users.id, sessionUser.id))
  const links = await db.select().from(userIdentities).where(eq(userIdentities.userId, sessionUser.id))

  if (links.length <= 1 && !user?.passwordHash) {
    throw createError({ statusCode: 409, message: 'Это единственный способ войти — сначала привяжи другой' })
  }

  await db
    .delete(userIdentities)
    .where(and(eq(userIdentities.userId, sessionUser.id), eq(userIdentities.provider, provider)))

  return { ok: true }
})
