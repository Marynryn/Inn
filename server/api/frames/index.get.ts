import { listFrames } from '../../utils/frames'

/** Весь каталог рамок. Открыт всем: рамка видна на чужих аватарках по всему
 *  сайту, и прятать её описание не от кого. */
export default defineEventHandler(async () => {
  const frames = await listFrames()
  return frames.map(({ inPool, ...frame }) => frame)
})
