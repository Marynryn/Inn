import { randomInt } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, eq, inArray } from 'drizzle-orm'
import type { AvatarFrame, OwnedFrame } from '#shared/utils/avatarFrames'
import { MAX_FRAME_BYTES, MAX_FRAME_SIDE, clampFit } from '#shared/utils/avatarFrames'
import { avatarFrames, userFrames, users } from '../database/schema'
import { checkImage } from './avatar'
import { useDb } from './db'
import { getStorageDir } from './storage'

type FrameRow = typeof avatarFrames.$inferSelect

const framesDir = () => join(getStorageDir(), 'frames')

/** Каталог отдаёт рамку в том виде, в каком её рисует браузер: ссылка и доля
 *  картинки под аватарку. Имя файла наружу не выходит — только адрес. */
export const toAvatarFrame = (f: FrameRow): AvatarFrame => ({
  id: f.id,
  name: f.name,
  url: `/api/frames/${f.file}`,
  fit: clampFit(f.fit),
})

export async function listFrames(): Promise<(AvatarFrame & { inPool: boolean })[]> {
  const rows = await useDb().select().from(avatarFrames).orderBy(avatarFrames.id)
  return rows.map(f => ({ ...toAvatarFrame(f), inPool: f.inPool }))
}

/** Рамки по списку id — тем, кто показывает чужие аватарки списком. Одним
 *  запросом на весь список, а не по рамке на строку. */
export async function framesByIds(ids: (number | null)[]): Promise<Map<number, AvatarFrame>> {
  const wanted = [...new Set(ids.filter((id): id is number => Boolean(id)))]
  const map = new Map<number, AvatarFrame>()
  if (!wanted.length) return map

  const rows = await useDb().select().from(avatarFrames).where(inArray(avatarFrames.id, wanted))
  for (const f of rows) map.set(f.id, toAvatarFrame(f))
  return map
}

/** Одна рамка — для сессии и профиля. */
export async function frameById(id: number | null | undefined): Promise<AvatarFrame | null> {
  if (!id) return null
  const [row] = await useDb().select().from(avatarFrames).where(eq(avatarFrames.id, id))
  return row ? toAvatarFrame(row) : null
}

/** Что человек выиграл — из этого списка он и выбирает. */
export async function ownedFrames(userId: number): Promise<OwnedFrame[]> {
  const rows = await useDb()
    .select({ frame: avatarFrames, grantedAt: userFrames.grantedAt })
    .from(userFrames)
    .innerJoin(avatarFrames, eq(avatarFrames.id, userFrames.frameId))
    .where(eq(userFrames.userId, userId))
    .orderBy(userFrames.grantedAt)

  return rows.map(r => ({ ...toAvatarFrame(r.frame), grantedAt: r.grantedAt, owned: true }))
}

/**
 * Из чего человек выбирает рамку. Читатель — только из выигранного, иначе
 * рамка перестала бы быть наградой. Хозяйке сайта показываем весь каталог:
 * ей рамку нужно примерить на живое лицо до того, как она кому-то достанется,
 * и заводить ради этого второй аккаунт незачем.
 */
export async function wearableFrames(userId: number, isAdmin: boolean): Promise<OwnedFrame[]> {
  const owned = await ownedFrames(userId)
  if (!isAdmin) return owned

  const has = new Set(owned.map(f => f.id))
  const rest = (await listFrames())
    .filter(f => !has.has(f.id))
    .map(({ inPool, ...frame }) => ({ ...frame, grantedAt: null, owned: false }))

  // Свои — первыми: выигранное и примеряемое в одном списке иначе смешается.
  return [...owned, ...rest]
}

/** Можно ли человеку носить эту рамку. Та же поблажка хозяйке сайта, что и в
 *  списке выбора: показали весь каталог — значит, надеть можно любую. */
export async function canWearFrame(userId: number, frameId: number, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return Boolean(await frameById(frameId))
  return ownsFrame(userId, frameId)
}

export async function ownsFrame(userId: number, frameId: number): Promise<boolean> {
  const [row] = await useDb()
    .select({ frameId: userFrames.frameId })
    .from(userFrames)
    .where(and(eq(userFrames.userId, userId), eq(userFrames.frameId, frameId)))
  return Boolean(row)
}

/**
 * Выдать рамку. Повторная выдача той же рамки — не ошибка: ивент может задеть
 * человека дважды, и падать на этом незачем. Возвращает рамку, если она новая.
 */
export async function grantFrame(userId: number, frameId: number): Promise<AvatarFrame | null> {
  const frame = await frameById(frameId)
  if (!frame) throw createError({ statusCode: 404, message: 'Рамки не существует' })
  if (await ownsFrame(userId, frameId)) return null

  await useDb().insert(userFrames).values({ userId, frameId })
  return frame
}

/**
 * Случайная рамка участнику ивента — из тех, что в раздаче и которых у него
 * ещё нет. Повтор выигрыша наградой не ощущается, поэтому уже выигранные из
 * жребия выкидываем; когда выкидывать нечего, возвращаем null — это не ошибка,
 * а «человек собрал всё».
 *
 * Жребий тянем криптостойким генератором: раздача призов — то место, где
 * «почти случайно» звучит плохо.
 */
export async function grantRandomFrame(userId: number): Promise<AvatarFrame | null> {
  const db = useDb()

  const pool = await db.select().from(avatarFrames).where(eq(avatarFrames.inPool, true))
  if (!pool.length) return null

  const owned = await db
    .select({ frameId: userFrames.frameId })
    .from(userFrames)
    .where(eq(userFrames.userId, userId))
  const has = new Set(owned.map(o => o.frameId))

  const left = pool.filter(f => !has.has(f.id))
  if (!left.length) return null

  const won = left[randomInt(left.length)]!
  await db.insert(userFrames).values({ userId, frameId: won.id })
  return toAvatarFrame(won)
}

/** Забрать рамку. Если она на человеке надета — снимаем: показывать рамку,
 *  которой у него больше нет, нельзя. */
export async function revokeFrame(userId: number, frameId: number) {
  const db = useDb()
  await db.delete(userFrames).where(and(eq(userFrames.userId, userId), eq(userFrames.frameId, frameId)))
  await db.update(users)
    .set({ avatarFrameId: null })
    .where(and(eq(users.id, userId), eq(users.avatarFrameId, frameId)))
}

/**
 * Кладёт картинку рамки на диск. Как и с аватарками, сервер картинку не
 * пережимает — только проверяет, что это картинка нужного веса и размера:
 * уменьшает её браузер, а нативной библиотеки на сервере у нас нет.
 */
export async function saveFrameImage(frameId: number, data: Buffer | Uint8Array): Promise<string> {
  const ext = checkImage(data, MAX_FRAME_BYTES, MAX_FRAME_SIDE)

  const dir = framesDir()
  await mkdir(dir, { recursive: true })

  // Отметка времени в имени, а не в ссылке: рамку видно на чужих аватарках по
  // всему сайту, и подменённая картинка иначе жила бы в кэшах читателей год.
  const file = `frame-${frameId}-${Date.now()}.${ext}`
  await writeFile(join(dir, file), data)
  return file
}

export async function deleteFrameImage(file: string) {
  await unlink(join(framesDir(), file)).catch(() => {})
}
