import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { getStorageDir } from '../../utils/storage'

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

/** Раздача картинок рамок — как у аватарок. Кэш на год безопасен: имя файла
 *  меняется при каждой замене картинки, так что старое имя всегда значит
 *  старую картинку. */
export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename')!
  if (filename.includes('..') || filename.includes('/')) {
    throw createError({ statusCode: 400 })
  }

  const data = await readFile(join(getStorageDir(), 'frames', filename)).catch(() => {
    throw createError({ statusCode: 404 })
  })

  setHeader(event, 'Content-Type', MIME[extname(filename).toLowerCase()] ?? 'application/octet-stream')
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  return data
})
