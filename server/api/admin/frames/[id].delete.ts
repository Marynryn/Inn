import { and, eq } from 'drizzle-orm'
import { avatarFrames, reelSegments, reels, userFrames, users } from '../../../database/schema'
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

  // Рамка идущего барабана выпадает прямо сейчас — без неё жребий выдал бы
  // пустоту. Сначала ивент завершают, потом рамку можно убрать.
  const [playing] = await db
    .select({ title: reels.title })
    .from(reelSegments)
    .innerJoin(reels, eq(reels.id, reelSegments.reelId))
    .where(and(eq(reelSegments.frameId, id), eq(reels.status, 'running')))
  if (playing) {
    throw createError({ statusCode: 409, message: `Рамка разыгрывается в «${playing.title}» — сначала заверши барабан` })
  }

  await db.update(users).set({ avatarFrameId: null }).where(eq(users.avatarFrameId, id))
  await db.delete(userFrames).where(eq(userFrames.frameId, id))
  await db.delete(avatarFrames).where(eq(avatarFrames.id, id))

  if (frame.file) await deleteFrameImage(frame.file)

  return { ok: true }
})
