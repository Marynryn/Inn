import { and, eq } from 'drizzle-orm'
import { profileSkins, reelSegments, reels, userSkins, users } from '../../../database/schema'
import { useDb } from '../../../utils/db'
import { deleteSkinImage } from '../../../utils/skins'

/** Удалить скин — значит забрать его у всех и снять с тех, кто его носит. */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, message: 'Неверный номер' })

  const db = useDb()
  const [skin] = await db.select().from(profileSkins).where(eq(profileSkins.id, id))
  if (!skin) throw createError({ statusCode: 404, message: 'Скин не найден' })

  // Скин идущего барабана выпадает прямо сейчас — как и с рамкой, сначала
  // ивент завершают, потом скин можно убрать.
  const [playing] = await db
    .select({ title: reels.title })
    .from(reelSegments)
    .innerJoin(reels, eq(reels.id, reelSegments.reelId))
    .where(and(eq(reelSegments.skinId, id), eq(reels.status, 'running')))
  if (playing) {
    throw createError({ statusCode: 409, message: `Скин разыгрывается в «${playing.title}» — сначала заверши барабан` })
  }

  await db.update(users).set({ skinId: null }).where(eq(users.skinId, id))
  await db.delete(userSkins).where(eq(userSkins.skinId, id))
  await db.delete(profileSkins).where(eq(profileSkins.id, id))
  if (skin.file) await deleteSkinImage(skin.file)

  return { ok: true }
})
