import { and, desc, eq, inArray } from 'drizzle-orm'
import { reelSegments, reelSpins, users } from '../../../../database/schema'
import { useDb } from '../../../../utils/db'
import { readerName } from '../../../../utils/identity'
import { reelFromRoute } from '../../../../utils/reel'

/**
 * Кто что выкрутил — последние попытки, свежие сверху. С ?won=1 — только
 * выигрыши, повторки тоже: приз выпал, просто он уже был. Их отдаём почти
 * все: при нескольких попытках в день выигрыши тонут среди сценок, а
 * последней полусотни на них не хватит.
 */
const LIMIT = 50
const WON_LIMIT = 500

export default defineEventHandler(async (event) => {
  const reel = await reelFromRoute(event)
  const onlyWon = getQuery(event).won === '1'

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
    .where(onlyWon
      ? and(eq(reelSpins.reelId, reel.id), inArray(reelSpins.outcome, ['won', 'duplicate']))
      : eq(reelSpins.reelId, reel.id))
    .orderBy(desc(reelSpins.id))
    .limit(onlyWon ? WON_LIMIT : LIMIT)

  return rows.map(({ displayName, email, ...r }) => ({ ...r, name: readerName({ displayName, email }) }))
})
