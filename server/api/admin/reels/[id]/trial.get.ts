import type { ReelState } from '#shared/utils/reel'
import { lookOf, reelFromRoute, segmentsOf, symbolsOf, textsOf } from '../../../../utils/reel'

/** Лента для пробной прокрутки — любого барабана, черновика тоже: посмотреть,
 *  как он крутится, нужно раньше, чем его увидят читатели. */
export default defineEventHandler(async (event): Promise<ReelState> => {
  const reel = await reelFromRoute(event)
  return {
    reel: { id: reel.id, title: reel.title, symbols: await symbolsOf(await segmentsOf(reel.id)), texts: textsOf(reel), look: lookOf(reel) },
    today: null,
    canSpin: true,
    left: null,
    perDay: reel.spinsPerDay,
  }
})
