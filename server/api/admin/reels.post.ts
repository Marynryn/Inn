import { REEL_TITLE_MAX } from '#shared/utils/reel'
import { reels } from '../../database/schema'
import { useDb } from '../../utils/db'

/** Новый барабан — пустым черновиком: сегменты добавляются потом. Сначала он
 *  только для админов: опробовать на проде, прежде чем открывать читателям. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ title?: string }>(event)
  const title = String(body?.title ?? '').trim().slice(0, REEL_TITLE_MAX)
  if (!title) throw createError({ statusCode: 400, message: 'У барабана должно быть название' })

  const [created] = await useDb().insert(reels).values({ title, adminsOnly: true }).returning({ id: reels.id })
  return { ok: true, id: created!.id }
})
