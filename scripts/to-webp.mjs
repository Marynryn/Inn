/**
 * Переводит картинки из public в webp: тот же вид, вес меньше в разы.
 *
 *   node scripts/to-webp.mjs [--replace]
 *
 * Без ключа только считает выгоду и кладёт .webp рядом; с --replace убирает
 * исходники, у которых webp вышел легче.
 */
import { readdir, stat, unlink } from 'node:fs/promises'
import { extname, join } from 'node:path'
import sharp from 'sharp'

const DIR = 'public'

/** Иконки не трогаем вовсе: вкладку и ярлык браузеры берут в png и ico. */
const SKIP = new Set(['fav.png', 'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon-192x192.png'])

/** Превью ссылки в мессенджерах: webp понимают не все, исходник оставляем. */
const KEEP_ORIGINAL = new Set(['hero.png'])

const kb = n => `${Math.round(n / 1024)} КБ`
const replace = process.argv.includes('--replace')

let before = 0
let after = 0

for (const name of await readdir(DIR)) {
  if (!['.png', '.jpg', '.jpeg'].includes(extname(name).toLowerCase()) || SKIP.has(name)) continue

  const src = join(DIR, name)
  const out = src.replace(/\.(png|jpe?g)$/i, '.webp')

  // Качество 82 глазом не отличить от исходника, а вес падает в разы. Усилие 6
  // считает дольше, но жмёт заметно лучше — делаем это один раз.
  await sharp(src).webp({ quality: 82, effort: 6 }).toFile(out)

  const wasSize = (await stat(src)).size
  const nowSize = (await stat(out)).size
  before += wasSize
  after += nowSize

  console.log(`${name}: ${kb(wasSize)} → ${kb(nowSize)} (−${Math.round((1 - nowSize / wasSize) * 100)}%)`)

  if (replace && nowSize < wasSize && !KEEP_ORIGINAL.has(name)) await unlink(src)
}

console.log(`\nВсего: ${kb(before)} → ${kb(after)} (−${Math.round((1 - after / before) * 100)}%)`)
if (!replace) console.log('Исходники на месте. Убрать их: node scripts/to-webp.mjs --replace')
