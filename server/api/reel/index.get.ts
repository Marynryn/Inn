import type { ReelState } from '#shared/utils/reel'
import { runningReelFor, segmentsOf, spinsLeft, symbolsOf, textsOf } from '../../utils/reel'

/**
 * Идущий барабан: лента символов, последняя сегодняшняя попытка и сколько
 * попыток осталось. Шансов и тиража не отдаём — их видит только хозяйка сайта.
 */
export default defineEventHandler(async (event): Promise<ReelState> => {
  const session = await getUserSession(event)
  const user = session.user as { id?: number, role?: string } | undefined
  const reel = await runningReelFor(user?.role)
  if (!reel) return { reel: null, today: null, canSpin: false, left: 0, perDay: 0 }

  const userId = user?.id ?? null
  const mine = userId ? await spinsLeft(reel, userId, user?.role) : { last: null, left: 0 }

  return {
    reel: { id: reel.id, title: reel.title, symbols: await symbolsOf(await segmentsOf(reel.id)), texts: textsOf(reel) },
    today: mine.last,
    canSpin: Boolean(userId) && mine.left !== 0,
    left: mine.left,
    perDay: reel.spinsPerDay,
  }
})
