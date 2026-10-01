import { count, countDistinct, desc, eq } from 'drizzle-orm'
import type { AdminReel } from '#shared/utils/reel'
import { reelSpins, reels } from '../../database/schema'
import { useDb } from '../../utils/db'
import { reelImageUrl, segmentsOf } from '../../utils/reel'

/** Все барабаны со сегментами и счётом: сколько раз что выпало. */
export default defineEventHandler(async (): Promise<AdminReel[]> => {
  const db = useDb()
  const list = await db.select().from(reels).orderBy(desc(reels.id))

  return Promise.all(list.map(async (reel) => {
    const segs = await segmentsOf(reel.id)

    const byOutcome = await db
      .select({ segmentId: reelSpins.segmentId, outcome: reelSpins.outcome, n: count() })
      .from(reelSpins)
      .where(eq(reelSpins.reelId, reel.id))
      .groupBy(reelSpins.segmentId, reelSpins.outcome)

    const [totals] = await db
      .select({ spins: count(), players: countDistinct(reelSpins.userId) })
      .from(reelSpins)
      .where(eq(reelSpins.reelId, reel.id))

    const tally = (segmentId: number, outcome?: string) => byOutcome
      .filter(r => r.segmentId === segmentId && (!outcome || r.outcome === outcome))
      .reduce((sum, r) => sum + r.n, 0)

    return {
      id: reel.id,
      title: reel.title,
      adminsOnly: reel.adminsOnly,
      status: reel.status,
      startedAt: reel.startedAt,
      finishedAt: reel.finishedAt,
      segments: segs.map(s => ({
        id: s.id,
        label: s.label,
        frameId: s.frameId,
        figure: s.figure,
        image: s.image,
        imageUrl: s.image ? reelImageUrl(s.image) : null,
        text: s.text,
        weight: s.weight,
        stock: s.stock,
        landed: tally(s.id),
        won: tally(s.id, 'won'),
        duplicates: tally(s.id, 'duplicate'),
      })),
      spins: totals?.spins ?? 0,
      players: totals?.players ?? 0,
    }
  }))
})
