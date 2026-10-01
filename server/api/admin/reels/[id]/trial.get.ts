import type { ReelState } from '#shared/utils/reel'
import { reelFromRoute, segmentsOf, symbolsOf, textsOf } from '../../../../utils/reel'

/** Лента для пробной прокрутки — любого барабана, черновика тоже: посмотреть,
 *  как он крутится, нужно раньше, чем его увидят читатели. */
export default defineEventHandler(async (event): Promise<ReelState> => {
  const reel = await reelFromRoute(event)
  return {
    reel: { id: reel.id, title: reel.title, symbols: await symbolsOf(await segmentsOf(reel.id)), texts: textsOf(reel) },
    today: null,
    canSpin: true,
  }
})
