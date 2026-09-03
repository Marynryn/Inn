import { useDb } from '../../utils/db'
import { users } from '../../database/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { toSessionUser } from '../../utils/identity'

/**
 * Вход по паролю. Остался для администраторов и аккаунтов, заведённых вручную:
 * у пришедших через Google или телеграм пароля нет вовсе.
 */
export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event)

  if (!email || !password) throw createError({ statusCode: 400, message: 'email и password обязательны' })

  const db = useDb()
  const [user] = await db.select().from(users).where(eq(users.email, String(email).trim().toLowerCase()))

  // Пустой passwordHash — это аккаунт из соцсети. Без этой проверки bcrypt
  // получил бы на вход null и уронил обработчик пятисоткой вместо отказа.
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw createError({ statusCode: 401, message: 'Неверный email или пароль' })
  }

  if (user.isBanned) throw createError({ statusCode: 403, message: 'Аккаунт заблокирован' })

  await setUserSession(event, { user: toSessionUser(user) })
  return { ok: true, role: user.role }
})
