import { desc, eq } from 'drizzle-orm'
import { reelSegments, reelSpins, users } from '../../../../database/schema'
import { useDb } from '../../../../utils/db'
import { readerName } from '../../../../utils/identity'
import { reelFromRoute } from '../../../../utils/reel'

/** Кто что выкрутил — последние попытки, свежие сверху. */
const LIMIT = 50

export default defineEventHandler(async (event) => {
  const reel = await reelFromRoute(event)

  const rows = await useDb()
    .select({
      id: reelSpins.id,
      userId: reelSpins.userId,
      outcome: reelSpins.outcome,
      createdAt: reelSpins.createdAt,
      label: reelSegments.label,
      displayName: users.displayName,
      email: users.email,
    })
    .from(reelSpins)
    .innerJoin(reelSegments, eq(reelSegments.id, reelSpins.segmentId))
    .innerJoin(users, eq(users.id, reelSpins.userId))
    .where(eq(reelSpins.reelId, reel.id))
    .orderBy(desc(reelSpins.id))
    .limit(LIMIT)

  return rows.map(({ displayName, email, ...r }) => ({ ...r, name: readerName({ displayName, email }) }))
})
