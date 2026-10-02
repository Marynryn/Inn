import { and, eq, inArray, ne } from 'drizzle-orm'
import { isFigureId } from '#shared/utils/nameFigures'
import type { ReelSegmentInput } from '#shared/utils/reel'
import { REEL_LABEL_MAX, REEL_TEXT_MAX, REEL_TITLE_MAX, REEL_WEIGHT_TOTAL, clampReelBlur, clampReelDim, clampSpinsPerDay, cleanReelTexts } from '#shared/utils/reel'
import { avatarFrames, profileSkins, reelSegments, reels } from '../../../database/schema'
import { useDb } from '../../../utils/db'
import { reelFromRoute } from '../../../utils/reel'

const IMAGE_NAME = /^scene-[\w-]+\.(webp|png|jpg|gif)$/
const BG_NAME = /^bg-[\w-]+\.(webp|png|jpg|gif)$/

/**
 * Сохранить барабан: название и сегменты целиком. Сегменты правятся только у
 * черновика — у идущего барабана шансы менять нельзя, иначе тем, кто крутил
 * вчера, выпадало бы по другим правилам. Название, «только для админов»,
 * попытки в день, тексты и фон окна поправить можно всегда.
 */
export default defineEventHandler(async (event) => {
  const reel = await reelFromRoute(event)
  const body = await readBody<{ title?: string; adminsOnly?: boolean; spinsPerDay?: number; texts?: Record<string, string>; background?: string | null; bgDim?: number; bgBlur?: number; segments?: ReelSegmentInput[] }>(event)
  const db = useDb()

  const title = String(body?.title ?? reel.title).trim().slice(0, REEL_TITLE_MAX)
  if (!title) throw createError({ statusCode: 400, message: 'У барабана должно быть название' })
  // «Только для админов» меняется когда угодно, и у идущего тоже: снять
  // галочку и значит открыть опробованный барабан читателям.
  const adminsOnly = typeof body?.adminsOnly === 'boolean' ? body.adminsOnly : reel.adminsOnly
  // Тексты окна — тоже когда угодно: слова не меняют правил розыгрыша.
  const texts = cleanReelTexts(body?.texts ?? reel.texts)
  // Попыток в день — тоже когда угодно: прибавить их посреди ивента не нечестно.
  const spinsPerDay = body?.spinsPerDay == null ? reel.spinsPerDay : clampSpinsPerDay(body.spinsPerDay)
  // Фон окна — тоже когда угодно. null снимает картинку, нет поля — не трогаем.
  const background = body?.background === undefined ? reel.background : body.background ? String(body.background) : null
  if (background && !BG_NAME.test(background)) throw createError({ statusCode: 400, message: 'Странная картинка фона' })
  const bgDim = body?.bgDim == null ? reel.bgDim : clampReelDim(body.bgDim)
  const bgBlur = body?.bgBlur == null ? reel.bgBlur : clampReelBlur(body.bgBlur)
  await db.update(reels).set({ title, adminsOnly, texts, spinsPerDay, background, bgDim, bgBlur }).where(eq(reels.id, reel.id))

  if (!body?.segments) return { ok: true }
  if (reel.status !== 'draft') {
    throw createError({ statusCode: 409, message: 'Барабан уже запущен — сегменты заморожены' })
  }

  const segs = body.segments.map((s, i) => {
    const n = i + 1
    const label = String(s?.label ?? '').trim().slice(0, REEL_LABEL_MAX)
    if (!label) throw createError({ statusCode: 400, message: `У сегмента ${n} нет названия` })

    const weight = Number(s.weight)
    if (!Number.isInteger(weight) || weight < 0 || weight > REEL_WEIGHT_TOTAL) {
      throw createError({ statusCode: 400, message: `У сегмента ${n} странный шанс` })
    }

    const frameId = s.frameId == null ? null : Number(s.frameId)
    if (frameId !== null && !Number.isInteger(frameId)) {
      throw createError({ statusCode: 400, message: `У сегмента ${n} странная рамка` })
    }

    // Рамка главнее: сегмент разыгрывает что-то одно.
    const figure = frameId === null && s.figure != null && s.figure !== '' ? String(s.figure) : null
    if (figure !== null && !isFigureId(figure)) {
      throw createError({ statusCode: 400, message: `У сегмента ${n} неизвестная фигурка` })
    }
    const skinId = frameId === null && figure === null && s.skinId != null ? Number(s.skinId) : null
    if (skinId !== null && !Number.isInteger(skinId)) {
      throw createError({ statusCode: 400, message: `У сегмента ${n} странный скин` })
    }
    const scene = frameId === null && figure === null && skinId === null

    // Тираж — только у приза: сценок не жалко.
    const stock = scene || s.stock == null || s.stock === ('' as any) ? null : Number(s.stock)
    if (stock !== null && (!Number.isInteger(stock) || stock < 1)) {
      throw createError({ statusCode: 400, message: `У сегмента ${n} тираж должен быть от одного` })
    }

    const image = scene && s.image ? String(s.image) : null
    if (image && !IMAGE_NAME.test(image)) {
      throw createError({ statusCode: 400, message: `У сегмента ${n} странная картинка` })
    }

    const text = scene ? String(s.text ?? '').trim().slice(0, REEL_TEXT_MAX) || null : null

    return { reelId: reel.id, sortOrder: i, label, frameId, figure, skinId, image, text, weight, stock }
  })

  const frameIds = segs.flatMap(s => (s.frameId ? [s.frameId] : []))
  if (new Set(frameIds).size !== frameIds.length) {
    throw createError({ statusCode: 400, message: 'Одна рамка стоит в двух сегментах' })
  }

  const skinIds = segs.flatMap(s => (s.skinId ? [s.skinId] : []))
  if (new Set(skinIds).size !== skinIds.length) {
    throw createError({ statusCode: 400, message: 'Один скин стоит в двух сегментах' })
  }
  if (skinIds.length) {
    const found = await db.select({ id: profileSkins.id }).from(profileSkins).where(inArray(profileSkins.id, skinIds))
    if (found.length !== skinIds.length) throw createError({ statusCode: 400, message: 'Такого скина нет в каталоге' })
  }

  // Фигурка может разыгрываться и в другом барабане — её не жалко, — но в одном
  // два одинаковых сегмента были бы просто удвоенным шансом.
  const figures = segs.flatMap(s => (s.figure ? [s.figure] : []))
  if (new Set(figures).size !== figures.length) {
    throw createError({ statusCode: 400, message: 'Одна фигурка стоит в двух сегментах' })
  }

  if (frameIds.length) {
    const found = await db.select({ id: avatarFrames.id }).from(avatarFrames).where(inArray(avatarFrames.id, frameIds))
    if (found.length !== frameIds.length) throw createError({ statusCode: 400, message: 'Такой рамки нет в каталоге' })

    // Рамки ивента уникальны: стоящую в другом барабане второй раз не разыграть.
    const taken = await db
      .select({ label: reelSegments.label, title: reels.title })
      .from(reelSegments)
      .innerJoin(reels, eq(reels.id, reelSegments.reelId))
      .where(and(inArray(reelSegments.frameId, frameIds), ne(reelSegments.reelId, reel.id)))
    if (taken.length) {
      throw createError({ statusCode: 409, message: `Рамка «${taken[0]!.label}» уже разыгрывается в «${taken[0]!.title}»` })
    }
  }

  await db.delete(reelSegments).where(eq(reelSegments.reelId, reel.id))
  if (segs.length) await db.insert(reelSegments).values(segs)

  // Рамка барабана — награда ивента, и в случайную раздачу из панели ей идти
  // незачем: так она достанется только тому, кому выпала.
  if (frameIds.length) {
    await db.update(avatarFrames).set({ inPool: false }).where(inArray(avatarFrames.id, frameIds))
  }

  return { ok: true }
})
