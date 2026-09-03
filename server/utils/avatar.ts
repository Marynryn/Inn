import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getStorageDir } from './storage'

/**
 * Аватарки кладутся как есть, без пережатия на сервере. Уменьшает картинку
 * браузер перед отправкой — sharp тут когда-то стоял, но это нативная
 * библиотека: nitro упаковывает её js, а libvips за собой не тянет, и сервер
 * падал при старте на линуксе. Ресайзер аватарок не должен быть условием
 * запуска сайта.
 */

/** Потолок на файл: том общий с базой и главами. Браузер присылает ~15 КБ. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024

const EXTENSIONS = ['webp', 'png', 'jpg', 'gif'] as const

/** Тип картинки — по сигнатуре файла, а не по имени: имя присылает клиент. */
function imageExtension(data: Uint8Array): typeof EXTENSIONS[number] | null {
  const b = data
  if (b.length < 12) return null

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif'

  const riff = String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!)
  const webp = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!)
  if (riff === 'RIFF' && webp === 'WEBP') return 'webp'

  return null
}

/**
 * Кладёт аватарку на диск. Имя файла зависит только от пользователя, поэтому к
 * ссылке дописывается отметка времени: раздача кэшируется на год, и без неё
 * браузер этот год показывал бы старую картинку.
 */
export async function saveAvatar(userId: number, data: Buffer | Uint8Array): Promise<string> {
  if (data.byteLength > MAX_AVATAR_BYTES) {
    throw createError({ statusCode: 413, message: 'Картинка больше 2 МБ' })
  }

  const ext = imageExtension(data)
  if (!ext) throw createError({ statusCode: 400, message: 'Не похоже на картинку' })

  const dir = join(getStorageDir(), 'avatars')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `avatar-${userId}.${ext}`), data)

  // Прежняя аватарка могла быть другого формата — она больше не нужна и по
  // ссылке недостижима, но место занимала бы до скончания века.
  for (const old of EXTENSIONS) {
    if (old !== ext) await unlink(join(dir, `avatar-${userId}.${old}`)).catch(() => {})
  }

  return `/api/avatars/avatar-${userId}.${ext}?v=${Date.now()}`
}

/**
 * Аватарка от провайдера. Качаем к себе, а не ссылаемся: телеграмовские ссылки
 * протухают, да и гонять читателей на чужой домен ради картинки незачем.
 * Не получилось — не беда: без аватарки жить можно, без входа нельзя.
 */
export async function saveRemoteAvatar(userId: number, url: string): Promise<string | null> {
  try {
    const data = await $fetch<ArrayBuffer>(url, { responseType: 'arrayBuffer', timeout: 5000 })
    return await saveAvatar(userId, new Uint8Array(data))
  } catch {
    return null
  }
}
