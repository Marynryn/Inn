import { useDb } from '../../utils/db'
import { users } from '../../database/schema'
import { eq } from 'drizzle-orm'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { getStorageDir } from '../../utils/storage'
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
  const updates: Record<string, string> = {}

  const namePart = form.find(f => f.name === 'displayName')
  if(namePart) updates.displayName = String(namePart.data).trim().slice(0, 40)

  const emailPart = form.find(f => f.name === 'email')
  if(emailPart){
    const email = String(emailPart.data).trim().toLowerCase()
    if(!email.includes('@')) throw createError({ statusCode: 400, message: 'Некорректный email' })
    updates.email = email
  }

  const pwPart = form.find(f => f.name === 'newPassword')
  const pw = pwPart ? String(pwPart.data).trim() : ''
  if(pw){
    if(pw.length < 6) throw createError({ statusCode: 400, message: 'Пароль минимум 6 символов' })
    updates.passwordHash = await bcrypt.hash(pw, 12)
  }

  const filePart = form.find(f => f.name === 'avatar' && f.data?.length)
  if(filePart){
    const ext = (filePart.filename ?? 'jpg').split('.').pop()?.toLowerCase() ?? 'jpg'
    const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif']
    if(!allowed.includes(ext)) throw createError({ statusCode: 400, message: 'Формат не поддерживается' })
    const filename = `avatar-${sessionUser.id}.${ext}`
    const avatarsDir = join(getStorageDir(), 'avatars')
    await mkdir(avatarsDir, { recursive: true })
    await writeFile(join(avatarsDir, filename), filePart.data)
    updates.avatarUrl = `/api/avatars/${filename}`
  }

  if(!Object.keys(updates).length) throw createError({ statusCode: 400, message: 'Нет данных для обновления' })

  await db.update(users).set(updates).where(eq(users.id, sessionUser.id))

  if(updates.email || updates.passwordHash){
    await replaceUserSession(event, {
      user: {
        id: sessionUser.id,
        email: updates.email ?? (session.user as any).email,
        role: sessionUser.role,
      }
    })
  }

  return { ok: true, ...updates }
})
