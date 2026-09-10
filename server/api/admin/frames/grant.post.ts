import { eq } from 'drizzle-orm'
import { users } from '../../../database/schema'
import { useDb } from '../../../utils/db'
import { grantFrame, grantRandomFrame, revokeFrame } from '../../../utils/frames'

/**
 * Выдать или забрать рамку. Тем же обработчиком тянется и жребий — так ивент,
 * когда он появится, сможет позвать `grantRandomFrame` напрямую, а руками
 * проверить раздачу можно уже сейчас.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ userId?: number; frameId?: number | 'random'; revoke?: boolean }>(event)

  const userId = Number(body?.userId)
  if (!Number.isInteger(userId)) throw createError({ statusCode: 400, message: 'Не выбран читатель' })

  const [user] = await useDb().select({ id: users.id }).from(users).where(eq(users.id, userId))
  if (!user) throw createError({ statusCode: 404, message: 'Читатель не найден' })

  if (body.frameId === 'random') {
    const frame = await grantRandomFrame(userId)
    return frame
      ? { ok: true, frame, message: `Выпала рамка «${frame.name}»` }
      : { ok: true, frame: null, message: 'Раздавать нечего: все рамки из раздачи у него уже есть' }
  }

  const frameId = Number(body?.frameId)
  if (!Number.isInteger(frameId)) throw createError({ statusCode: 400, message: 'Не выбрана рамка' })

  if (body.revoke) {
    await revokeFrame(userId, frameId)
    return { ok: true, frame: null, message: 'Рамка забрана' }
  }

  const frame = await grantFrame(userId, frameId)
  return frame
    ? { ok: true, frame, message: `Рамка «${frame.name}» выдана` }
    : { ok: true, frame: null, message: 'Эта рамка у него уже есть' }
})
