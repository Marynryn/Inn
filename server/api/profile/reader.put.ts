import { eq } from 'drizzle-orm'
import { normalizeReaderSettings } from '#shared/utils/readerSettings'
import { users } from '../../database/schema'
import { useDb } from '../../utils/db'

/**
 * Сохранить вид страницы главы. Присланное приводится к допустимым рамкам, а
 * не проверяется на ошибку: окно настроек шлёт каждое движение ползунка, и
 * ронять его из-за лишнего знака после запятой незачем.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const sessionUser = session.user as { id: number } | undefined
  if (!sessionUser?.id) throw createError({ statusCode: 401, message: 'Нужно войти' })

  const settings = normalizeReaderSettings(await readBody(event))

  const db = useDb()
  await db
    .update(users)
    .set({ readerSettings: JSON.stringify(settings) })
    .where(eq(users.id, sessionUser.id))

  return { ok: true, settings }
})
