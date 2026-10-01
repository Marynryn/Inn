import { eq } from 'drizzle-orm'
import { reelSegments, reels } from '../../../database/schema'
import { useDb } from '../../../utils/db'
import { reelFromRoute } from '../../../utils/reel'

/** Удалить можно только черновик: у запущенного есть попытки и выигрыши, и
 *  история ивента не должна пропадать одной кнопкой. */
export default defineEventHandler(async (event) => {
  const reel = await reelFromRoute(event)
  if (reel.status !== 'draft') {
    throw createError({ statusCode: 409, message: 'Удалить можно только черновик' })
  }

  const db = useDb()
  await db.delete(reelSegments).where(eq(reelSegments.reelId, reel.id))
  await db.delete(reels).where(eq(reels.id, reel.id))
  return { ok: true }
})
