import { eq } from 'drizzle-orm'
import { SKIN_NAME_MAX, isHexColor, parseEffects } from '#shared/utils/profileSkins'
import { profileSkins } from '../../../database/schema'
import { useDb } from '../../../utils/db'
import { deleteSkinImage, saveSkinImage, toProfileSkin } from '../../../utils/skins'

/** Правка скина: название, цвета, эффекты и — если приложили — новая картинка. */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, message: 'Неверный номер' })

  const db = useDb()
  const [skin] = await db.select().from(profileSkins).where(eq(profileSkins.id, id))
  if (!skin) throw createError({ statusCode: 404, message: 'Скин не найден' })

  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, message: 'Нет данных' })
  const part = (name: string) => form.find(f => f.name === name)
  const text = (name: string) => part(name)?.data.toString('utf8').trim()

  const updates: Partial<typeof profileSkins.$inferInsert> = {}

  const name = text('name')
  if (name !== undefined) {
    if (!name) throw createError({ statusCode: 400, message: 'У скина должно быть название' })
    updates.name = name.slice(0, SKIN_NAME_MAX)
  }

  for (const key of ['accent', 'tint'] as const) {
    const color = text(key)
    if (color === undefined) continue
    if (!isHexColor(color)) throw createError({ statusCode: 400, message: 'Цвет — в виде #a1b2c3' })
    updates[key] = color
  }

  const effects = text('effects')
  if (effects !== undefined) updates.effects = parseEffects(effects).join(',')

  const imagePart = form.find(f => f.name === 'image' && f.data?.length)
  if (imagePart) updates.file = await saveSkinImage(id, imagePart.data)

  if (!Object.keys(updates).length) throw createError({ statusCode: 400, message: 'Нечего менять' })

  const [saved] = await db.update(profileSkins).set(updates).where(eq(profileSkins.id, id)).returning()

  // Старую картинку — только после того, как строка указывает на новую.
  if (updates.file && skin.file) await deleteSkinImage(skin.file)

  return { ok: true, skin: toProfileSkin(saved!) }
})
