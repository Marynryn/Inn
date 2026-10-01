import { eq } from 'drizzle-orm'
import { reels } from '../../../../database/schema'
import { useDb } from '../../../../utils/db'
import { reelFromRoute } from '../../../../utils/reel'

/** Завершить ивент. Выигранные рамки остаются у читателей. */
export default defineEventHandler(async (event) => {
  const reel = await reelFromRoute(event)
  if (reel.status !== 'running') throw createError({ statusCode: 409, message: 'Барабан сейчас не идёт' })

  await useDb().update(reels)
    .set({ status: 'finished', finishedAt: new Date().toISOString() })
    .where(eq(reels.id, reel.id))
  return { ok: true }
})
