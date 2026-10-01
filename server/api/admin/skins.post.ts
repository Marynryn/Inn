import { eq } from 'drizzle-orm'
import { SKIN_NAME_MAX, isHexColor, parseEffects } from '#shared/utils/profileSkins'
import { profileSkins } from '../../database/schema'
import { useDb } from '../../utils/db'
import { saveSkinImage, toProfileSkin } from '../../utils/skins'

/**
 * Новый скин в каталог. Строка заводится раньше картинки: имя файла содержит
 * номер скина, а номер выдаёт база. Не записалась картинка — убираем и строку.
 */
export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, message: 'Нет данных' })
  const value = (name: string) => form.find(f => f.name === name)?.data.toString('utf8').trim() ?? ''

  const name = value('name').slice(0, SKIN_NAME_MAX)
  if (!name) throw createError({ statusCode: 400, message: 'У скина должно быть название' })

  const filePart = form.find(f => f.name === 'image' && f.data?.length)
  if (!filePart) throw createError({ statusCode: 400, message: 'Нет картинки' })

  const accent = value('accent')
  const tint = value('tint')
  if ((accent && !isHexColor(accent)) || (tint && !isHexColor(tint))) {
    throw createError({ statusCode: 400, message: 'Цвет — в виде #a1b2c3' })
  }

  const db = useDb()
  const [created] = await db.insert(profileSkins).values({
    name,
    file: '',
    ...(accent ? { accent } : {}),
    ...(tint ? { tint } : {}),
    effects: parseEffects(value('effects')).join(','),
  }).returning()

  try {
    const file = await saveSkinImage(created!.id, filePart.data)
    const [saved] = await db.update(profileSkins).set({ file }).where(eq(profileSkins.id, created!.id)).returning()
    return { ok: true, skin: toProfileSkin(saved!) }
  } catch (e) {
    await db.delete(profileSkins).where(eq(profileSkins.id, created!.id))
    throw e
  }
})
