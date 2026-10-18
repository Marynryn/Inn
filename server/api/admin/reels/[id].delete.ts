import { eq } from 'drizzle-orm'
import { reelGuestTries, reelSegments, reelSpins, reels } from '../../../database/schema'
import { useDb } from '../../../utils/db'
import { reelFromRoute } from '../../../utils/reel'

/** Удалить можно черновик или завершённый барабан. Идущий — нет: его сначала
 *  завершают, чтобы ивент не обрывался одной кнопкой. У завершённого уходит и
 *  журнал прокруток, а выигранное остаётся у читателей — оно хранится отдельно. */
export default defineEventHandler(async (event) => {
  const reel = await reelFromRoute(event)
  if (reel.status === 'running') {
    throw createError({ statusCode: 409, message: 'Идущий барабан сначала нужно завершить' })
  }

  const db = useDb()
  await db.batch([
    db.delete(reelSpins).where(eq(reelSpins.reelId, reel.id)),
    db.delete(reelGuestTries).where(eq(reelGuestTries.reelId, reel.id)),
    db.delete(reelSegments).where(eq(reelSegments.reelId, reel.id)),
    db.delete(reels).where(eq(reels.id, reel.id)),
  ])
  return { ok: true }
})
