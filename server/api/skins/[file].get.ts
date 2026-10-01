import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { getStorageDir } from '../../utils/storage'

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

/** Картинки скинов — как рамки: имя меняется при каждой замене, кэш на год безопасен. */
export default defineEventHandler(async (event) => {
  const file = getRouterParam(event, 'file')!
  if (file.includes('..') || file.includes('/') || file.includes('\\')) {
    throw createError({ statusCode: 400 })
  }

  const data = await readFile(join(getStorageDir(), 'skins', file)).catch(() => {
    throw createError({ statusCode: 404 })
  })

  setHeader(event, 'Content-Type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream')
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  return data
})
