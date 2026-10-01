import { randomInt } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, asc, count, eq } from 'drizzle-orm'
import type { ReelSymbol, SpinResult } from '#shared/utils/reel'
import { figureById } from '#shared/utils/nameFigures'
import { REEL_IMAGE_MAX_BYTES, REEL_IMAGE_MAX_SIDE, cleanReelTexts, fullReelTexts } from '#shared/utils/reel'
import { reelSegments, reelSpins, reels, userFrames } from '../database/schema'
import { checkImage } from './avatar'
import { useDb } from './db'
import { grantFigure, ownsFigure } from './figures'
import { framesByIds, ownsFrame } from './frames'
import { grantSkin, ownsSkin, skinById } from './skins'
import { mskDay } from './msk'
import { getStorageDir } from './storage'

type Reel = typeof reels.$inferSelect
type Segment = typeof reelSegments.$inferSelect

export const reelImageUrl = (file: string) => `/api/reel-images/${file}`

/** Приз ли сегмент: рамка, фигурка или скин. Ничего из этого — сценка. */
export const isPrize = (s: Segment) => Boolean(s.frameId || s.figure || s.skinId)

/** Идущий барабан. Он один: второй запустить нельзя, пока идёт первый. */
export async function runningReel(): Promise<Reel | null> {
  const [row] = await useDb().select().from(reels).where(eq(reels.status, 'running')).limit(1)
  return row ?? null
}

/** Идущий барабан, если этому человеку его видно: барабан «только для
 *  админов» — проба на проде, и читателю его будто нет. */
export async function runningReelFor(role: string | undefined): Promise<Reel | null> {
  const reel = await runningReel()
  return reel && (!reel.adminsOnly || role === 'admin') ? reel : null
}

/** Тексты окна барабана целиком — то, что видит читатель. */
export const textsOf = (reel: Reel) => fullReelTexts(cleanReelTexts(reel.texts))

/** Барабан по номеру из адреса — или 404. */
export async function reelFromRoute(event: Parameters<typeof getRouterParam>[0]): Promise<Reel> {
  const id = Number(getRouterParam(event, 'id'))
  const [row] = Number.isInteger(id)
    ? await useDb().select().from(reels).where(eq(reels.id, id))
    : []
  if (!row) throw createError({ statusCode: 404, message: 'Такого барабана нет' })
  return row
}

export async function segmentsOf(reelId: number): Promise<Segment[]> {
  return useDb().select().from(reelSegments)
    .where(eq(reelSegments.reelId, reelId))
    .orderBy(asc(reelSegments.sortOrder), asc(reelSegments.id))
}

/** Сколько раз каждый приз уже выдан — по нему считается остаток тиража.
 *  Повторка не в счёт: приз никому не достался. */
export async function wonCounts(reelId: number): Promise<Map<number, number>> {
  const rows = await useDb()
    .select({ segmentId: reelSpins.segmentId, n: count() })
    .from(reelSpins)
    .where(and(eq(reelSpins.reelId, reelId), eq(reelSpins.outcome, 'won')))
    .groupBy(reelSpins.segmentId)
  return new Map(rows.map(r => [r.segmentId, r.n]))
}

/** Символы ленты: картинка рамки, фигурки, скина (его угол) или сценки. Без
 *  картинки символа нет — такой сегмент запустить не дадут, но черновик показать
 *  надо, поэтому пропускаем. */
export async function symbolsOf(segs: Segment[]): Promise<ReelSymbol[]> {
  const frames = await framesByIds(segs.map(s => s.frameId))
  const skins = new Map(await Promise.all(
    segs.filter(s => s.skinId).map(async s => [s.skinId!, await skinById(s.skinId)] as const),
  ))
  return segs.flatMap((s) => {
    const url = s.frameId
      ? frames.get(s.frameId)?.url
      : s.figure
        ? figureById(s.figure)?.big
        : s.skinId
          ? skins.get(s.skinId)?.url
          : s.image ? reelImageUrl(s.image) : null
    return url ? [{ id: s.id, label: s.label, url, isPrize: isPrize(s) }] : []
  })
}

/**
 * Жребий. Приз, у которого кончился тираж, из него выходит, и её шанс
 * делится между остальными пропорционально — иначе проценты из панели
 * перестали бы складываться в сто.
 *
 * Когда призов не осталось вовсе, а у сценок шанс нулевой, крутить всё равно
 * можно: выпадает сценка, любая с равной вероятностью. Если нет и сценок —
 * разыгрывать нечего, и это говорит null.
 *
 * Жребий криптостойкий, как и у прочих раздач: «почти случайно» про призы
 * звучит плохо.
 */
export function pickSegment(segs: Segment[], won: Map<number, number>): Segment | null {
  const left = (s: Segment) => !isPrize(s) || s.stock == null || (won.get(s.id) ?? 0) < s.stock
  const open = segs.filter(s => s.weight > 0 && left(s))
  const total = open.reduce((sum, s) => sum + s.weight, 0)

  if (total > 0) {
    let r = randomInt(total)
    for (const s of open) {
      r -= s.weight
      if (r < 0) return s
    }
  }

  const scenes = segs.filter(s => !isPrize(s))
  return scenes.length ? scenes[randomInt(scenes.length)]! : null
}

/** Результат попытки таким, каким его показывает окно. */
export async function toSpinResult(seg: Segment, outcome: SpinResult['outcome']): Promise<SpinResult> {
  const frame = seg.frameId ? (await framesByIds([seg.frameId])).get(seg.frameId) ?? null : null
  const figure = seg.frameId ? null : figureById(seg.figure)
  const skin = seg.frameId || figure ? null : await skinById(seg.skinId)
  return {
    segmentId: seg.id,
    outcome,
    label: seg.label,
    text: isPrize(seg) ? null : seg.text,
    imageUrl: frame?.url ?? figure?.big ?? skin?.url ?? (seg.image ? reelImageUrl(seg.image) : ''),
    frame,
    figure,
    skin,
  }
}

/** Сегодняшняя попытка читателя в этом барабане, если была. */
export async function todaysSpin(reelId: number, userId: number): Promise<SpinResult | null> {
  const [row] = await useDb()
    .select({ outcome: reelSpins.outcome, seg: reelSegments })
    .from(reelSpins)
    .innerJoin(reelSegments, eq(reelSegments.id, reelSpins.segmentId))
    .where(and(eq(reelSpins.reelId, reelId), eq(reelSpins.userId, userId), eq(reelSpins.day, mskDay())))
  return row ? toSpinResult(row.seg, row.outcome) : null
}

const isUniqueViolation = (e: any) =>
  /UNIQUE constraint failed/.test(`${e?.message ?? ''} ${e?.cause?.message ?? ''}`)

/**
 * Попытка читателя. Сначала пишем саму попытку и только потом выдаём приз:
 * вторая попытка за день упрётся в уникальный индекс раньше, чем что-то
 * получит.
 *
 * Приз выдаём без уведомления: человек смотрит на него прямо сейчас в окне
 * поздравления, и «тебе досталась рамка» в колокольчике следом было бы эхом.
 */
export async function spin(userId: number, role: string | undefined): Promise<SpinResult> {
  const reel = await runningReelFor(role)
  if (!reel) throw createError({ statusCode: 404, message: 'Барабан сейчас не крутится' })

  // Админ крутит сколько угодно — чтобы опробовать барабан по-настоящему, с
  // выдачей и повторками. Его попытки пишутся с днём «2026-10-01#…»: уникальный
  // индекс их не держит, а «сегодняшняя попытка» их не видит.
  const isAdmin = role === 'admin'
  if (!isAdmin && await todaysSpin(reel.id, userId)) {
    throw createError({ statusCode: 409, message: 'Сегодня уже крутил — приходи завтра' })
  }

  const segs = await segmentsOf(reel.id)
  const seg = pickSegment(segs, await wonCounts(reel.id))
  if (!seg) throw createError({ statusCode: 409, message: 'Разыгрывать больше нечего' })

  const figure = figureById(seg.figure)
  const owned = seg.frameId
    ? await ownsFrame(userId, seg.frameId)
    : figure
      ? await ownsFigure(userId, figure.id)
      : seg.skinId ? await ownsSkin(userId, seg.skinId) : false
  const outcome = !isPrize(seg) ? 'scene' : owned ? 'duplicate' : 'won'

  const db = useDb()
  try {
    const day = isAdmin ? `${mskDay()}#${Date.now()}` : mskDay()
    await db.insert(reelSpins).values({ reelId: reel.id, userId, day, segmentId: seg.id, outcome })
  } catch (e) {
    if (isUniqueViolation(e)) throw createError({ statusCode: 409, message: 'Сегодня уже крутил — приходи завтра' })
    throw e
  }

  if (outcome === 'won' && seg.frameId) {
    await db.insert(userFrames).values({ userId, frameId: seg.frameId }).onConflictDoNothing()
  } else if (outcome === 'won' && figure) {
    await grantFigure(userId, figure.id)
  } else if (outcome === 'won' && seg.skinId) {
    await grantSkin(userId, seg.skinId)
  }

  return toSpinResult(seg, outcome)
}

/** Пробная прокрутка из панели: тот же жребий, но ничего не пишется и не выдаётся. */
export async function trialSpin(reelId: number): Promise<SpinResult> {
  const segs = await segmentsOf(reelId)
  const seg = pickSegment(segs, await wonCounts(reelId))
  if (!seg) throw createError({ statusCode: 409, message: 'Разыгрывать нечего: нет ни призов, ни сценок' })
  return toSpinResult(seg, isPrize(seg) ? 'won' : 'scene')
}

/** Картинка сценки на диск. Как и с рамками, сервер её не пережимает — только
 *  проверяет, что это картинка нужного веса и размера. */
export async function saveReelImage(data: Buffer | Uint8Array): Promise<string> {
  const ext = checkImage(data, REEL_IMAGE_MAX_BYTES, REEL_IMAGE_MAX_SIDE)
  const dir = join(getStorageDir(), 'reel')
  await mkdir(dir, { recursive: true })

  // Имя новое на каждую загрузку: раздача кэшируется на год, и заменённая
  // картинка под старым именем жила бы в браузерах читателей.
  const file = `scene-${Date.now()}-${randomInt(1_000_000)}.${ext}`
  await writeFile(join(dir, file), data)
  return file
}
