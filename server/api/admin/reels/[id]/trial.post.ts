import { reelFromRoute, trialSpin } from '../../../../utils/reel'

/** Пробная прокрутка: тот же жребий, но ничего не пишется и не выдаётся. */
export default defineEventHandler(async (event) => {
  const reel = await reelFromRoute(event)
  return trialSpin(reel.id)
})
