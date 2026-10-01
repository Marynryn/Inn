import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'
import { useDb } from '../../utils/db'
import { toSessionUser } from '../../utils/identity'

/**
 * Кто вошёл. Имя, аватарку и рамку берём из базы, а не из сессии: сессия
 * запоминает их при входе и живёт долго, а адрес аватарки может смениться и без
 * нового входа — так было, когда файлы аватарок переехали под публичные коды, и
 * у вошедших раньше шапка показывала битую картинку. Свежее кладём и в сессию.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const sessionUser = session.user as { id?: number, role?: string } | undefined
  if (!sessionUser?.id) return null

  const [row] = await useDb().select().from(users).where(eq(users.id, sessionUser.id))
  // Учётку удалили или заблокировали, пока сессия жила, — для сайта он больше не вошедший.
  if (!row || row.isBanned) {
    await clearUserSession(event)
    return null
  }

  const user = await toSessionUser(row)
  await replaceUserSession(event, { user })

  // Свой номер читателю ни к чему, а выдаёт он многое: только что пришедший по
  // нему видит, сколько людей пришло до него. Хозяйке сайта номер нужен —
  // рамки и прочее в панели выдаются по нему.
  if (user.role === 'admin') return user
  const { id: _id, ...rest } = user
  return rest
})
