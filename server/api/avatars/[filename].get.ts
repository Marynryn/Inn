import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { getStorageDir } from '../../utils/storage'

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename')!
  if(filename.includes('..') || filename.includes('/')){
    throw createError({ statusCode: 400 })
  }

  const filepath = join(getStorageDir(), 'avatars', filename)
  const data = await readFile(filepath).catch(() => {
    throw createError({ statusCode: 404 })
  })

  const mime = MIME[extname(filename).toLowerCase()] ?? 'application/octet-stream'
  setHeader(event, 'Content-Type', mime)
  setHeader(event, 'Cache-Control', 'public, max-age=31536000')
  return data
})
