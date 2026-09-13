import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Файлы из server/assets Nitro кладёт в собранный сервер и отдаёт через useStorage.
 * В dev тот же путь читается с диска — на случай, если стораж ещё не прогрет.
 * Путь — относительно server/assets: «game/glossary.json».
 */
export async function readServerAsset(path: string): Promise<unknown> {
  try {
    const item = await useStorage('assets:server').getItem(path)
    if (item) return item
  } catch {
    // упадём в чтение с диска ниже
  }
  return readFileSync(resolve('server/assets', path), 'utf8')
}

/** В сборке ассет приезжает байтами, в dev — строкой; наружу всегда текст. */
export function assetText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8')
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString('utf8')
  return JSON.stringify(value)
}

/** Ассет, которого может и не быть: тогда пустая строка, а не ошибка. */
export async function readServerAssetOrEmpty(path: string): Promise<string> {
  try {
    return assetText(await readServerAsset(path))
  } catch {
    return ''
  }
}
