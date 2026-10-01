import { eq } from 'drizzle-orm'
import { users } from '../../../database/schema'
import { useDb } from '../../../utils/db'
import { grantSkin, revokeSkin } from '../../../utils/skins'

/** Выдать или забрать скин — как рамку. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ userId?: number; skinId?: number; revoke?: boolean }>(event)

  const userId = Number(body?.userId)
  const skinId = Number(body?.skinId)
  if (!Number.isInteger(userId)) throw createError({ statusCode: 400, message: 'Не выбран читатель' })
  if (!Number.isInteger(skinId)) throw createError({ statusCode: 400, message: 'Не выбран скин' })

  const [user] = await useDb().select({ id: users.id }).from(users).where(eq(users.id, userId))
  if (!user) throw createError({ statusCode: 404, message: 'Читатель не найден' })

  if (body.revoke) {
    await revokeSkin(userId, skinId)
    return { ok: true, message: 'Скин забран' }
  }

  return (await grantSkin(userId, skinId))
    ? { ok: true, message: 'Скин выдан' }
    : { ok: true, message: 'Этот скин у него уже есть' }
})
