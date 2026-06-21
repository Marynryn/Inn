import { useDb } from '../../utils/db'
import { users } from '../../database/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event)

  if (!email || !password) throw createError({ statusCode: 400, message: 'email и password обязательны' })

  const db = useDb()
  const [user] = await db.select().from(users).where(eq(users.email, email))

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw createError({ statusCode: 401, message: 'Неверный email или пароль' })
  }

  await setUserSession(event, { user: { id: user.id, email: user.email, role: user.role } })
  return { ok: true, role: user.role }
})
