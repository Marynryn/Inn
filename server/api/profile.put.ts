import { eq } from 'drizzle-orm'
import { displayNameKey, nameFromEmail, normalizeDisplayName } from '#shared/utils/displayName'
import { users } from '../database/schema'
import { saveAvatar } from '../utils/avatar'
import { useDb } from '../utils/db'
import { assertNameFree, saveUnique } from '../utils/display-name'
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
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id))
  if (!me) throw createError({ statusCode: 404, message: 'Пользователь не найден' })

  const updates: Partial<typeof users.$inferInsert> = {}

  const namePart = form.find(f => f.name === 'displayName')
  if (namePart) {
    // Пустое поле — «имени нет»: подписью снова становится почта, и занятой
    // считается уже она. Поэтому свободу проверяем у того имени, которое в
    // итоге увидят под комментариями, а не у введённого.
    const name = normalizeDisplayName(namePart.data)
    const shown = name || nameFromEmail(me.email)
    await assertNameFree(shown, me.id)

    updates.displayName = name || null
    updates.displayNameKey = displayNameKey(shown) || null
  }

  const filePart = form.find(f => f.name === 'avatar' && f.data?.length)
  if (filePart) {
    // saveAvatar проверяет сигнатуру, вес и размеры сам — имени, присланному
    // клиентом, верить нельзя. Его ошибку не переписываем: она точнее нашей.
    updates.avatarUrl = await saveAvatar(sessionUser.id, filePart.data)
  }

  if (form.find(f => f.name === 'removeAvatar')) updates.avatarUrl = null

  if (!Object.keys(updates).length) {
    throw createError({ statusCode: 400, message: 'Нечего сохранять' })
  }

  const [updated] = await saveUnique(() =>
    db.update(users).set(updates).where(eq(users.id, sessionUser.id)).returning())

  // Шапка и комментарии берут имя с аватаркой из сессии — обновляем и её,
  // иначе новый ник появится только после следующего входа.
  await replaceUserSession(event, { user: toSessionUser(updated!) })

  return { ok: true, displayName: updated!.displayName, avatarUrl: updated!.avatarUrl }
})
