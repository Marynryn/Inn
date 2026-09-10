import { FRAME_FIT_DEFAULT, FRAME_NAME_MAX, clampFit } from '#shared/utils/avatarFrames'
import { avatarFrames } from '../../database/schema'
import { useDb } from '../../utils/db'
import { saveFrameImage, toAvatarFrame } from '../../utils/frames'
import { eq } from 'drizzle-orm'

/**
 * Новая рамка в каталог. Строка заводится раньше картинки: имя файла содержит
 * номер рамки, а номер выдаёт база.
 */
export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, message: 'Нет данных' })

  const value = (name: string) => form.find(f => f.name === name)?.data.toString('utf8').trim() ?? ''

  const name = value('name').slice(0, FRAME_NAME_MAX)
  if (!name) throw createError({ statusCode: 400, message: 'У рамки должно быть название' })

  const filePart = form.find(f => f.name === 'image' && f.data?.length)
  if (!filePart) throw createError({ statusCode: 400, message: 'Нет картинки' })

  const fit = clampFit(Number(value('fit')) || FRAME_FIT_DEFAULT)
  const inPool = value('inPool') !== '0'

  const db = useDb()
  const [created] = await db.insert(avatarFrames).values({ name, file: '', fit, inPool }).returning()

  // Картинку записываем после строки, а строку с пустым файлом никому не
  // показываем: не записалась картинка — убираем и строку, иначе в каталоге
  // осталась бы рамка без вида.
  try {
    const file = await saveFrameImage(created!.id, filePart.data)
    const [saved] = await db.update(avatarFrames).set({ file }).where(eq(avatarFrames.id, created!.id)).returning()
    return { ok: true, frame: { ...toAvatarFrame(saved!), inPool: saved!.inPool, isDefault: saved!.isDefault, owners: 0 } }
  } catch (e) {
    await db.delete(avatarFrames).where(eq(avatarFrames.id, created!.id))
    throw e
  }
})
