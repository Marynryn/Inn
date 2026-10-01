import { eq } from 'drizzle-orm'
import { REEL_WEIGHT_TOTAL, weightToPercent } from '#shared/utils/reel'
import { reels } from '../../../../database/schema'
import { useDb } from '../../../../utils/db'
import { reelFromRoute, runningReel, segmentsOf, symbolsOf } from '../../../../utils/reel'

/** Запустить барабан. Проверяем здесь, а не при сохранении: черновик вправе
 *  быть недоделанным, а запущенный — нет. */
export default defineEventHandler(async (event) => {
  const reel = await reelFromRoute(event)
  if (reel.status !== 'draft') throw createError({ statusCode: 409, message: 'Барабан уже запускали' })

  const other = await runningReel()
  if (other) throw createError({ statusCode: 409, message: `Сначала заверши «${other.title}»: барабан идёт один за раз` })

  const segs = await segmentsOf(reel.id)
  if (segs.length < 2) throw createError({ statusCode: 400, message: 'Нужно хотя бы два сегмента' })

  const total = segs.reduce((sum, s) => sum + s.weight, 0)
  if (total !== REEL_WEIGHT_TOTAL) {
    throw createError({ statusCode: 400, message: `Шансы дают ${String(weightToPercent(total)).replace('.', ',')}%, а нужно ровно 100%` })
  }

  // Символ без картинки на ленте не нарисовать: сценке нужна картинка, а
  // рамка могла быть удалена из каталога, пока барабан лежал черновиком.
  const symbols = await symbolsOf(segs)
  const missing = segs.find(s => !symbols.some(sym => sym.id === s.id))
  if (missing) throw createError({ statusCode: 400, message: `У сегмента «${missing.label}» нет картинки` })

  await useDb().update(reels)
    .set({ status: 'running', startedAt: new Date().toISOString() })
    .where(eq(reels.id, reel.id))
  return { ok: true }
})
