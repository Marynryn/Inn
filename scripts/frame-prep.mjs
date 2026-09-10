/**
 * Готовит картинку рамки к загрузке в админку.
 *
 * Нейросети почти никогда не отдают настоящую прозрачность: вместо неё в
 * пикселях либо плоская заливка, либо нарисованная «шашечка прозрачности» —
 * серые квадратики, которые выглядят как пустота, но ею не являются. Такую
 * рамку сайт покажет квадратом поверх аватарки. Скрипт снимает такой фон,
 * подрезает поля, ужимает до 512 и меряет дырку под аватарку.
 *
 *   node scripts/frame-prep.mjs картинка.png [-o готовая.webp]
 */
import { basename, dirname, extname, join } from 'node:path'
import sharp from 'sharp'

const SIDE = 512
const QUALITY = 90

/** Область фона меньше тысячи пикселей — это блик внутри рисунка, не фон. */
const MIN_BG_AREA = 1000

/** Насколько цвет пикселя может отличаться от фонового и всё ещё считаться фоном. */
const COLOR_TOLERANCE = 20

const args = process.argv.slice(2)
const input = args.find(a => !a.startsWith('-'))
if (!input) {
  console.error('Укажи картинку: node scripts/frame-prep.mjs рамка.png [-o готовая.webp]')
  process.exit(1)
}

const outFlag = args.indexOf('-o')
const output = outFlag >= 0
  ? args[outFlag + 1]
  : join(dirname(input), `${basename(input, extname(input))}-frame.webp`)

const src = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const data = src.data
const { width: w, height: h, channels: ch } = src.info
const px = (p) => p * ch

console.log(`${basename(input)} — ${w}×${h}`)

// ── Есть ли уже настоящая прозрачность ───────────────────────
let transparent = 0
for (let p = 0; p < w * h; p++) if (data[px(p) + 3] < 40) transparent++
const transparentShare = transparent / (w * h)

if (transparentShare > 0.2) {
  console.log(`прозрачность на месте (${(transparentShare * 100).toFixed(0)}% площади) — фон не трогаю`)
} else {
  // ── Какого цвета фон: смотрим рамку по краю картинки ───────
  // Шашечка даёт два близких тона, плоская заливка — один. Берём два самых
  // частых: второй лишний не помешает, а на шашечке он и есть половина фона.
  const edge = new Map()
  const mark = (x, y) => {
    const i = px(y * w + x)
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
    edge.set(key, (edge.get(key) ?? 0) + 1)
  }
  for (let x = 0; x < w; x++) for (let d = 0; d < 4; d++) { mark(x, d); mark(x, h - 1 - d) }
  for (let y = 0; y < h; y++) for (let d = 0; d < 4; d++) { mark(d, y); mark(w - 1 - d, y) }

  const tones = [...edge.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([k]) => [(k >> 16) & 255, (k >> 8) & 255, k & 255])

  console.log('фон по краю:', tones.map(t => '#' + t.map(v => v.toString(16).padStart(2, '0')).join('')).join(' и '))

  const isBg = (i) => tones.some(([r, g, b]) =>
    Math.abs(data[i] - r) <= COLOR_TOLERANCE
    && Math.abs(data[i + 1] - g) <= COLOR_TOLERANCE
    && Math.abs(data[i + 2] - b) <= COLOR_TOLERANCE)

  // ── Область за областью ───────────────────────────────────
  // Просто «убрать все пиксели такого цвета» нельзя: тем же почти-белым
  // написаны блики на крыльях и костях. Поэтому считаем связные области и
  // убираем только крупные — фон всегда крупный, блик всегда мелкий.
  const total = w * h
  const label = new Int32Array(total).fill(-1)
  const sizes = []

  for (let start = 0; start < total; start++) {
    if (label[start] !== -1 || !isBg(px(start))) continue
    const id = sizes.length
    let size = 0
    const stack = [start]
    label[start] = id

    while (stack.length) {
      const p = stack.pop()
      size++
      const x = p % w, y = (p / w) | 0
      const around = [
        x + 1 < w ? p + 1 : -1,
        x > 0 ? p - 1 : -1,
        y + 1 < h ? p + w : -1,
        y > 0 ? p - w : -1,
      ]
      for (const q of around) {
        if (q < 0 || label[q] !== -1 || !isBg(px(q))) continue
        label[q] = id
        stack.push(q)
      }
    }
    sizes.push(size)
  }

  let cleared = 0
  for (let p = 0; p < total; p++) {
    if (label[p] >= 0 && sizes[label[p]] >= MIN_BG_AREA) { data[px(p) + 3] = 0; cleared++ }
  }

  // ── Крапины ────────────────────────────────────────────────
  // Картинку могли сжать с потерями, и тогда часть фона отличается по цвету
  // достаточно, чтобы не попасть в допуск: остаётся белая крошка по пустоте.
  // Убираем те области фонового цвета, вокруг которых нет ничего, кроме уже
  // снятого фона. Блик внутри крыла так не пропадёт: у него соседи — рисунок.
  const LOOSE = 60
  const isBgLoose = (i) => tones.some(([r, g, b]) =>
    Math.abs(data[i] - r) <= LOOSE
    && Math.abs(data[i + 1] - g) <= LOOSE
    && Math.abs(data[i + 2] - b) <= LOOSE)

  const seen = new Uint8Array(total)
  let specks = 0

  for (let start = 0; start < total; start++) {
    if (seen[start] || data[px(start) + 3] < 40 || !isBgLoose(px(start))) continue

    const area = [start]
    const stack = [start]
    seen[start] = 1
    let touchesArt = false

    while (stack.length) {
      const p0 = stack.pop()
      const x = p0 % w, y = (p0 / w) | 0
      const around = [
        x + 1 < w ? p0 + 1 : -1,
        x > 0 ? p0 - 1 : -1,
        y + 1 < h ? p0 + w : -1,
        y > 0 ? p0 - w : -1,
      ]
      for (const q of around) {
        if (q < 0) continue
        if (data[px(q) + 3] < 40) continue // пустота — за неё область не растёт
        if (!isBgLoose(px(q))) { touchesArt = true; continue }
        if (seen[q]) continue
        seen[q] = 1
        area.push(q)
        stack.push(q)
      }
    }

    if (touchesArt) continue // это блик на рисунке, а не крапина в пустоте
    for (const q of area) data[px(q) + 3] = 0
    cleared += area.length
    specks++
  }

  const kept = sizes.filter(s => s < MIN_BG_AREA).length
  console.log(`снято ${(100 * cleared / total).toFixed(0)}% площади`
    + `, крапин в пустоте убрано: ${specks}`
    + `, светлых пятен внутри рисунка сохранено: ${kept}`)

  if (cleared / total < 0.2) {
    console.log('⚠ фона сняли подозрительно мало — возможно, он не плоский.')
    console.log('  Проси у нейросети либо прозрачный PNG, либо заливку одним цветом,')
    console.log('  которого нет в рисунке: "on a solid pure magenta #FF00FF background".')
  }
}

// ── Подрезаем поля, оставляя рамку по центру ─────────────────
const cx = (w - 1) / 2, cy = (h - 1) / 2
let radius = 0
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  if (data[px(y * w + x) + 3] < 40) continue
  const d = Math.hypot(x - cx, y - cy)
  if (d > radius) radius = d
}

const side = Math.min(w, h, Math.ceil(radius * 2))
const left = Math.max(0, Math.round(cx - side / 2))
const top = Math.max(0, Math.round(cy - side / 2))

await sharp(data, { raw: { width: w, height: h, channels: ch } })
  .extract({ left, top, width: Math.min(side, w - left), height: Math.min(side, h - top) })
  .resize(SIDE, SIDE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .webp({ quality: QUALITY, alphaQuality: 100 })
  .toFile(output)

// ── Меряем дырку ─────────────────────────────────────────────
// По лучам из центра: для каждого направления — где начинается рисунок.
// Разброс велик, потому что детали свисают внутрь; берём и минимум, и середину.
const done = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const d2 = done.data, s2 = done.info.width, ch2 = done.info.channels
const c2 = (s2 - 1) / 2
const rays = new Array(720).fill(Infinity)

for (let y = 0; y < s2; y++) for (let x = 0; x < s2; x++) {
  if (d2[(y * s2 + x) * ch2 + 3] < 40) continue
  const dx = x - c2, dy = y - c2
  const a = Math.floor(((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360 * 2)
  const dist = Math.hypot(dx, dy)
  if (dist < rays[a]) rays[a] = dist
}

const sorted = [...rays].filter(Number.isFinite).sort((a, b) => a - b)
const share = p => 2 * sorted[Math.floor(p * (sorted.length - 1))] / s2
const min = share(0), mid = share(0.5)

// Ползунком на двух живых рамках выходило чуть выше середины между самым
// глубоким свесом и обычным краем кольца — оттуда и прикидка.
const guess = Math.round(((min + mid) / 2 + 0.025) * 100) / 100

console.log(`\n${output}`)
console.log(`дырка: самый глубокий свес ${min.toFixed(2)}, обычный край ${mid.toFixed(2)}`)
console.log(`посадка: начни с ${guess.toFixed(2)} и подгони ползунком в админке`)

// Дырка меньше трети картинки — рамкой это уже не назовёшь: скорее всего, в
// середине остался неснятый фон, и посадку выше считать не по чему.
if (mid < 0.35) {
  console.log('')
  console.log('⚠ середина картинки не пустая — там что-то есть.')
  console.log('  Открой файл и посмотри: если по пустоте разбросан мусор, фон был')
  console.log('  не плоский. Проси прозрачный PNG или заливку одним цветом.')
}
