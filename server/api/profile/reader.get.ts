import { eq } from 'drizzle-orm'
import { normalizeReaderSettings } from '#shared/utils/readerSettings'
import { users } from '../../database/schema'
import { useDb } from '../../utils/db'

/** Вид страницы главы, сохранённый у читателя. null — ещё не настраивал. */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const sessionUser = session.user as { id: number } | undefined
  if (!sessionUser?.id) throw createError({ statusCode: 401, message: 'Нужно войти' })

  const db = useDb()
  const [row] = await db
    .select({ readerSettings: users.readerSettings })
    .from(users)
    .where(eq(users.id, sessionUser.id))

  if (!row?.readerSettings) return { settings: null }

  try {
    return { settings: normalizeReaderSettings(JSON.parse(row.readerSettings)) }
  }
  catch {
    // Испорченная строка — то же, что её нет: читатель настроит заново.
    return { settings: null }
  }
})
