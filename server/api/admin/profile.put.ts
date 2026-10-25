import { displayNameKey, nameFromEmail, normalizeDisplayName } from '#shared/utils/displayName'
import { assertNameFree, saveUnique } from '../../utils/display-name'
import { useDb } from '../../utils/db'
import { users } from '../../database/schema'
import { eq } from 'drizzle-orm'
import { saveAvatar } from '../../utils/avatar'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const sessionUser = session.user as { id: number; role: string } | undefined
  if(!sessionUser?.id || sessionUser.role !== 'admin'){
    throw createError({ statusCode: 403, message: 'Нет доступа' })
  }

  const form = await readMultipartFormData(event)
  if(!form){throw createError({ statusCode: 400, message: 'Нет данных' })}

  const db = useDb()
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id))
  if(!me) throw createError({ statusCode: 404, message: 'Пользователь не найден' })

  const updates: Partial<typeof users.$inferInsert> = {}

  const emailPart = form.find(f => f.name === 'email')
  if(emailPart){
    const email = String(emailPart.data).trim().toLowerCase()
    if(!email.includes('@')) throw createError({ statusCode: 400, message: 'Некорректный email' })
    updates.email = email
  }

  // Имя администратора занято наравне со всеми: подписаться «Админом» больше
  // никто не сможет. Стёртое имя возвращает подпись к почте — на занятость
  // проверяем именно то имя, которое в итоге увидят под комментариями.
  const namePart = form.find(f => f.name === 'displayName')
  if(namePart){
    const name = normalizeDisplayName(namePart.data)
    const shown = name || nameFromEmail(updates.email ?? me.email)
    await assertNameFree(shown, me)

    updates.displayName = name || null
    updates.displayNameKey = displayNameKey(shown) || null
  }

  const pwPart = form.find(f => f.name === 'newPassword')
  const pw = pwPart ? String(pwPart.data).trim() : ''
  if(pw){
    if(pw.length < 6) throw createError({ statusCode: 400, message: 'Пароль минимум 6 символов' })
    updates.passwordHash = await bcrypt.hash(pw, 12)
  }

  // На демо-стенде вход в панель общий: смени кто-нибудь почту или пароль —
  // остальные посетители до ночного сброса остались бы за дверью.
  if(useRuntimeConfig(event).public.demo && ((updates.email && updates.email !== me.email) || pw)){
    throw createError({ statusCode: 403, message: 'В демо-версии почту и пароль администратора не меняют: этим входом пользуются все посетители' })
  }

  // Та же проверка и та же раскладка по диску, что у читателей: без них сюда
  // однажды легла фотография на 4,8 МБ, и её качал каждый, кто открывал главную.
  const filePart = form.find(f => f.name === 'avatar' && f.data?.length)
  if(filePart){
    updates.avatarUrl = await saveAvatar(sessionUser.id, filePart.data)
  }

  if(!Object.keys(updates).length) throw createError({ statusCode: 400, message: 'Нет данных для обновления' })

  await saveUnique(() => db.update(users).set(updates).where(eq(users.id, sessionUser.id)))

  if(updates.email || updates.passwordHash){
    await replaceUserSession(event, {
      user: {
        id: sessionUser.id,
        email: updates.email ?? (session.user as any).email,
        role: sessionUser.role,
      }
    })
  }

  // Хеш пароля наружу не отдаём, даже самой хозяйке.
  const { passwordHash: _, ...shown } = updates
  return { ok: true, ...shown }
})
