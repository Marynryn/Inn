import { useDb } from '../../utils/db'
import { users } from '../../database/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const sessionUser = session.user as { id: number; role: string } | undefined
  if(!sessionUser?.id || sessionUser.role !== 'admin'){
    throw createError({ statusCode: 403, message: 'Нет доступа' })
  }

  const { email, password, role = 'admin' } = await readBody(event)
  if(!email || !password) throw createError({ statusCode: 400, message: 'email и password обязательны' })
  if(password.length < 6) throw createError({ statusCode: 400, message: 'Пароль минимум 6 символов' })
  if(!['admin', 'reader'].includes(role)) throw createError({ statusCode: 400, message: 'Неверная роль' })

  const db = useDb()
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.trim().toLowerCase()))
  if(existing) throw createError({ statusCode: 409, message: 'Пользователь с таким email уже существует' })

  const hash = await bcrypt.hash(password, 12)
  await db.insert(users).values({ email: email.trim().toLowerCase(), passwordHash: hash, role })

  return { ok: true }
})
