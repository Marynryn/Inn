import { eq } from 'drizzle-orm'
import { users } from '../database/schema'
import { saveAvatar } from '../utils/avatar'
import { useDb } from '../utils/db'
import { toSessionUser } from '../utils/identity'

/**
 * Ник и аватарка читателя. Почта и пароль сюда не входят: у аккаунтов из
 * соцсетей их нет, а у администратора для этого есть своя страница.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const sessionUser = session.user as { id: number } | undefined
  if (!sessionUser?.id) throw createError({ statusCode: 401, message: 'Нужно войти' })

  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, message: 'Нет данных' })

  const db = useDb()
  const updates: Partial<typeof users.$inferInsert> = {}

  const namePart = form.find(f => f.name === 'displayName')
  if (namePart) {
    updates.displayName = String(namePart.data).trim().slice(0, 40) || null
  }

  const filePart = form.find(f => f.name === 'avatar' && f.data?.length)
  if (filePart) {
    // Формат проверяется по сигнатуре файла внутри saveAvatar — имени,
    // присланному клиентом, верить нельзя.
    updates.avatarUrl = await saveAvatar(sessionUser.id, filePart.data).catch(() => {
      throw createError({ statusCode: 400, message: 'Не похоже на картинку' })
    })
  }

  if (form.find(f => f.name === 'removeAvatar')) updates.avatarUrl = null

  if (!Object.keys(updates).length) {
    throw createError({ statusCode: 400, message: 'Нечего сохранять' })
  }

  const [updated] = await db.update(users).set(updates).where(eq(users.id, sessionUser.id)).returning()

  // Шапка и комментарии берут имя с аватаркой из сессии — обновляем и её,
  // иначе новый ник появится только после следующего входа.
  await replaceUserSession(event, { user: toSessionUser(updated!) })

  return { ok: true, displayName: updated!.displayName, avatarUrl: updated!.avatarUrl }
})
