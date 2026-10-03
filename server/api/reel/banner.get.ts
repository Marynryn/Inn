import type { ReelBanner } from '#shared/utils/reel'
import { bannerOf, runningReelFor, textsOf } from '../../utils/reel'

/**
 * Баннер идущего барабана для главной. Видят все, гости тоже: крутить им
 * нельзя, но позвать их войти ради попытки — и есть смысл баннера. Барабан
 * «только для админов» видят только админы. Нет барабана — null, и на главной
 * остаётся плашка игры.
 */
export default defineEventHandler(async (event): Promise<ReelBanner | null> => {
  const session = await getUserSession(event)
  const reel = await runningReelFor((session.user as { role?: string } | undefined)?.role)
  if (!reel) return null

  const t = textsOf(reel)
  return { id: reel.id, title: t.bannerTitle, text: t.bannerText, button: t.bannerButton, images: bannerOf(reel) }
})
