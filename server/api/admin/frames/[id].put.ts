import { eq } from 'drizzle-orm'
import { FRAME_NAME_MAX, clampFit } from '#shared/utils/avatarFrames'
import { avatarFrames } from '../../../database/schema'
import { useDb } from '../../../utils/db'
import { deleteFrameImage, saveFrameImage, setDefaultFrame, toAvatarFrame } from '../../../utils/frames'

/**
 * Правка рамки: название, посадка аватарки, участие в раздаче и — если
 * приложили — новая картинка. Посадка правится чаще всего: на глаз её угадать
 * нельзя, её подгоняют, глядя на живую аватарку.
 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, message: 'Неверный номер' })

  const db = useDb()
  const [frame] = await db.select().from(avatarFrames).where(eq(avatarFrames.id, id))
  if (!frame) throw createError({ statusCode: 404, message: 'Рамка не найдена' })

  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, message: 'Нет данных' })

  const part = (name: string) => form.find(f => f.name === name)
  const updates: Partial<typeof avatarFrames.$inferInsert> = {}

  const namePart = part('name')
  if (namePart) {
    const name = namePart.data.toString('utf8').trim().slice(0, FRAME_NAME_MAX)
    if (!name) throw createError({ statusCode: 400, message: 'У рамки должно быть название' })
    updates.name = name
  }

  const fitPart = part('fit')
  if (fitPart) updates.fit = clampFit(Number(fitPart.data.toString('utf8')))

  const poolPart = part('inPool')
  if (poolPart) updates.inPool = poolPart.data.toString('utf8').trim() !== '0'

  const imagePart = form.find(f => f.name === 'image' && f.data?.length)
  if (imagePart) updates.file = await saveFrameImage(id, imagePart.data)

  // Отметка «для новичков» правится не как остальные поля: она одна на сайт,
  // и включение её здесь снимает её со всех прочих рамок.
  const defaultPart = part('isDefault')
  if (defaultPart) {
    await setDefaultFrame(defaultPart.data.toString('utf8').trim() === '0' ? null : id)
  }

  if (!Object.keys(updates).length && !defaultPart) {
    throw createError({ statusCode: 400, message: 'Нечего менять' })
  }

  const [saved] = Object.keys(updates).length
    ? await db.update(avatarFrames).set(updates).where(eq(avatarFrames.id, id)).returning()
    : await db.select().from(avatarFrames).where(eq(avatarFrames.id, id))

  // Старую картинку убираем только после того, как новая записана и строка на
  // неё указывает: иначе неудачная замена оставила бы рамку без вида.
  if (updates.file && frame.file) await deleteFrameImage(frame.file)

  return { ok: true, frame: { ...toAvatarFrame(saved!), inPool: saved!.inPool, isDefault: saved!.isDefault } }
})
