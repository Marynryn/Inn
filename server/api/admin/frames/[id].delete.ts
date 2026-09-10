import { eq } from 'drizzle-orm'
import { avatarFrames, userFrames, users } from '../../../database/schema'
import { useDb } from '../../../utils/db'
import { deleteFrameImage } from '../../../utils/frames'

/**
 * Удаление рамки. Забирает её и у всех, кто её выиграл, — рамки, которой нет в
 * каталоге, не должно остаться ни на одной аватарке. Потому в админке это и
 * спрашивается отдельно: удалить рамку значит отменить чью-то награду.
 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, message: 'Неверный номер' })

  const db = useDb()
  const [frame] = await db.select().from(avatarFrames).where(eq(avatarFrames.id, id))
  if (!frame) throw createError({ statusCode: 404, message: 'Рамка не найдена' })

  await db.update(users).set({ avatarFrameId: null }).where(eq(users.avatarFrameId, id))
  await db.delete(userFrames).where(eq(userFrames.frameId, id))
  await db.delete(avatarFrames).where(eq(avatarFrames.id, id))

  if (frame.file) await deleteFrameImage(frame.file)

  return { ok: true }
})
