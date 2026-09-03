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

/**
 * Потолок на файл. Браузер после пережатия присылает ~15 КБ, так что запас
 * двадцатикратный — но форму можно обойти и послать запрос напрямую, а том
 * общий с базой и главами. Потолок здесь не «на всякий случай», а против
 * злоупотребления.
 */
export const MAX_AVATAR_BYTES = 300 * 1024

/** Сторона аватарки — 256 пикселей. Всё, что заметно больше, аватаркой не
 *  является: правило должно звучать «это аватарка», а не «это мелкий файл». */
export const MAX_AVATAR_SIDE = 1024

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
 * Размеры картинки из её заголовка — ширина и высота лежат в первых байтах, и
 * читать их можно без всякой библиотеки. Вернуть null значит «не разобрали»:
 * формат мы уже опознали по сигнатуре, так что это не повод отказывать.
 */
function imageSize(b: Uint8Array, ext: string): { width: number; height: number } | null {
  const be16 = (i: number) => (b[i]! << 8) | b[i + 1]!
  const be32 = (i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0
  const le16 = (i: number) => b[i]! | (b[i + 1]! << 8)
  const le24 = (i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16)

  if (ext === 'png' && b.length > 24) {
    return { width: be32(16), height: be32(20) }
  }

  if (ext === 'gif' && b.length > 10) {
    return { width: le16(6), height: le16(8) }
  }

  if (ext === 'webp' && b.length > 30) {
    const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!)
    if (chunk === 'VP8X') return { width: le24(24) + 1, height: le24(27) + 1 }
    if (chunk === 'VP8 ') return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff }
    if (chunk === 'VP8L') {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    return null
  }

  if (ext === 'jpg') {
    // Размеры лежат в кадровом сегменте, а до него идут произвольные метаданные —
    // приходится идти по сегментам, перешагивая каждый по его длине.
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }

      const marker = b[i + 1]!
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 — всё, кроме
      // 0xc4 (таблицы Хаффмана), 0xc8 и 0xcc, которые кадром не являются.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: be16(i + 5), width: be16(i + 7) }
      }

      i += 2 + be16(i + 2)
    }
    return null
  }

  return null
}

/**
 * Кладёт аватарку на диск. Имя файла зависит только от пользователя, поэтому к
 * ссылке дописывается отметка времени: раздача кэшируется на год, и без неё
 * браузер этот год показывал бы старую картинку.
 */
export async function saveAvatar(userId: number, data: Buffer | Uint8Array): Promise<string> {
  if (data.byteLength > MAX_AVATAR_BYTES) {
    throw createError({ statusCode: 413, message: 'Картинка больше 300 КБ' })
  }

  const ext = imageExtension(data)
  if (!ext) throw createError({ statusCode: 400, message: 'Не похоже на картинку' })

  const size = imageSize(data, ext)
  if (size && (size.width > MAX_AVATAR_SIDE || size.height > MAX_AVATAR_SIDE)) {
    throw createError({ statusCode: 400, message: `Картинка больше ${MAX_AVATAR_SIDE}×${MAX_AVATAR_SIDE}` })
  }

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
