import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { getStorageDir } from './storage'

/** Потолок на входной файл: том общий с базой и главами, обои там ни к чему. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024

/**
 * Кладёт аватарку на диск — всегда webp 256×256, как бы её ни прислали. Имя
 * файла зависит только от пользователя, поэтому к ссылке дописывается отметка
 * времени: раздача аватарок кэшируется на год, и без неё браузер этот год
 * показывал бы старую картинку.
 */
export async function saveAvatar(userId: number, data: Buffer | Uint8Array): Promise<string> {
  if (data.byteLength > MAX_AVATAR_BYTES) {
    throw createError({ statusCode: 413, message: 'Картинка больше 5 МБ' })
  }

  const webp = await sharp(data)
    .rotate() // по метке ориентации: фото с телефона иначе ложится набок
    .resize(256, 256, { fit: 'cover' })
    .webp({ quality: 82 })
    .toBuffer()

  const dir = join(getStorageDir(), 'avatars')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `avatar-${userId}.webp`), webp)

  return `/api/avatars/avatar-${userId}.webp?v=${Date.now()}`
}

/**
 * Аватарка от провайдера. Качаем к себе, а не ссылаемся: телеграмовские ссылки
 * протухают, да и гонять читателей на чужой домен ради картинки незачем.
 * Не получилось — не беда: без аватарки жить можно, без входа нельзя.
 */
export async function saveRemoteAvatar(userId: number, url: string): Promise<string | null> {
  try {
    const data = await $fetch<ArrayBuffer>(url, { responseType: 'arrayBuffer', timeout: 5000 })
    return await saveAvatar(userId, Buffer.from(data))
  } catch {
    return null
  }
}
