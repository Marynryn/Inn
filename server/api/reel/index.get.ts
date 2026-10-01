import type { ReelState } from '#shared/utils/reel'
import { runningReelFor, segmentsOf, symbolsOf, textsOf, todaysSpin } from '../../utils/reel'

/**
 * Идущий барабан: лента символов и сегодняшняя попытка читателя. Шансов и
 * тиража не отдаём — их видит только хозяйка сайта.
 */
export default defineEventHandler(async (event): Promise<ReelState> => {
  const session = await getUserSession(event)
  const user = session.user as { id?: number, role?: string } | undefined
  const reel = await runningReelFor(user?.role)
  if (!reel) return { reel: null, today: null, canSpin: false }

  const userId = user?.id ?? null
  const today = userId ? await todaysSpin(reel.id, userId) : null

  return {
    reel: { id: reel.id, title: reel.title, symbols: await symbolsOf(await segmentsOf(reel.id)), texts: textsOf(reel) },
    today,
    canSpin: Boolean(userId) && !today,
  }
})
