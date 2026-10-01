import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import type { OwnedSkin, ProfileSkin } from '#shared/utils/profileSkins'
import { MAX_SKIN_BYTES, MAX_SKIN_SIDE, parseEffects } from '#shared/utils/profileSkins'
import { profileSkins, userSkins, users } from '../database/schema'
import { checkImage } from './avatar'
import { useDb } from './db'
import { getStorageDir } from './storage'

type SkinRow = typeof profileSkins.$inferSelect

const skinsDir = () => join(getStorageDir(), 'skins')

export const toProfileSkin = (s: SkinRow): ProfileSkin => ({
  id: s.id,
  name: s.name,
  url: `/api/skins/${s.file}`,
  accent: s.accent,
  tint: s.tint,
  effects: parseEffects(s.effects),
})

export async function listSkins(): Promise<ProfileSkin[]> {
  const rows = await useDb().select().from(profileSkins).orderBy(profileSkins.id)
  return rows.map(toProfileSkin)
}

export async function skinById(id: number | null | undefined): Promise<ProfileSkin | null> {
  if (!id) return null
  const [row] = await useDb().select().from(profileSkins).where(eq(profileSkins.id, id))
  return row ? toProfileSkin(row) : null
}

export async function ownsSkin(userId: number, skinId: number): Promise<boolean> {
  const [row] = await useDb()
    .select({ skinId: userSkins.skinId })
    .from(userSkins)
    .where(and(eq(userSkins.userId, userId), eq(userSkins.skinId, skinId)))
  return Boolean(row)
}

/**
 * Из чего человек выбирает скин. Читатель — только из выданного. Хозяйке
 * сайта показываем весь каталог, но лишь для примерки: надеть — то есть
 * показать всем — она может только выданный себе, как и с рамками.
 */
export async function wearableSkins(userId: number, isAdmin: boolean): Promise<OwnedSkin[]> {
  const db = useDb()
  const rows = await db
    .select({ skin: profileSkins, grantedAt: userSkins.grantedAt })
    .from(userSkins)
    .innerJoin(profileSkins, eq(profileSkins.id, userSkins.skinId))
    .where(eq(userSkins.userId, userId))
    .orderBy(userSkins.grantedAt)

  const owned: OwnedSkin[] = rows.map(r => ({ ...toProfileSkin(r.skin), grantedAt: r.grantedAt, owned: true }))
  if (!isAdmin) return owned

  const has = new Set(owned.map(s => s.id))
  const rest = (await listSkins()).filter(s => !has.has(s.id)).map(s => ({ ...s, grantedAt: null, owned: false }))
  return [...owned, ...rest]
}

/** Выдать скин. Повторная выдача — не ошибка: возвращает false. */
export async function grantSkin(userId: number, skinId: number): Promise<boolean> {
  if (!(await skinById(skinId))) throw createError({ statusCode: 404, message: 'Скина не существует' })
  if (await ownsSkin(userId, skinId)) return false
  await useDb().insert(userSkins).values({ userId, skinId })
  return true
}

/** Забрать скин. Надетый — снимаем: показывать то, чего у человека нет, нельзя. */
export async function revokeSkin(userId: number, skinId: number) {
  const db = useDb()
  await db.delete(userSkins).where(and(eq(userSkins.userId, userId), eq(userSkins.skinId, skinId)))
  await db.update(users).set({ skinId: null }).where(and(eq(users.id, userId), eq(users.skinId, skinId)))
}

/** Картинка угла на диск. Сервер её не пережимает — только проверяет. */
export async function saveSkinImage(skinId: number, data: Buffer | Uint8Array): Promise<string> {
  const ext = checkImage(data, MAX_SKIN_BYTES, MAX_SKIN_SIDE)
  const dir = skinsDir()
  await mkdir(dir, { recursive: true })

  // Отметка времени в имени: скин видно на страницах читателей, и подменённая
  // картинка под старым именем жила бы в кэшах год.
  const file = `skin-${skinId}-${Date.now()}.${ext}`
  await writeFile(join(dir, file), data)
  return file
}

export async function deleteSkinImage(file: string) {
  await unlink(join(skinsDir(), file)).catch(() => {})
}
