import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const src = 'public/fav.jpg'
const outDir = 'public'

// Load as grayscale raw pixels
// Distribution: bg=0-5 (90%), edges=5-20 (0.7%), pan=20-62 (9.3%)
const { data: raw, info } = await sharp(src)
  .grayscale()
  .raw()
  .toBuffer({ resolveWithObject: true })

const { width, height } = info

// Black-and-white output: background → white (255), pan → black (0)
const out = Buffer.alloc(raw.length)
const BG_THRESHOLD = 12  // values below this → white background, above → black pan

for (let i = 0; i < raw.length; i++) {
  out[i] = raw[i] < BG_THRESHOLD ? 255 : 0
}

function circleMask(size) {
  const r = size / 2
  return Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="white"/></svg>`
  )
}

async function resized(size) {
  const base = await sharp(out, { raw: { width, height, channels: 1 } })
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer()

  return await sharp(base)
    .composite([{ input: circleMask(size), blend: 'dest-in' }])
    .png()
    .toBuffer()
}

const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-192x192.png', size: 192 },
  { name: 'favicon-512x512.png', size: 512 },
]

for (const { name, size } of sizes) {
  const buf = await resized(size)
  fs.writeFileSync(path.join(outDir, name), buf)
  console.log(`✓ ${name}`)
}

// favicon.ico (Vista+ PNG-in-ICO)
const png32 = await resized(32)

const iconDir = Buffer.alloc(6)
iconDir.writeUInt16LE(0, 0)
iconDir.writeUInt16LE(1, 2)
iconDir.writeUInt16LE(1, 4)

const entry = Buffer.alloc(16)
entry.writeUInt8(32, 0)
entry.writeUInt8(32, 1)
entry.writeUInt8(0, 2)
entry.writeUInt8(0, 3)
entry.writeUInt16LE(1, 4)
entry.writeUInt16LE(32, 6)
entry.writeUInt32LE(png32.length, 8)
entry.writeUInt32LE(6 + 16, 12)

fs.writeFileSync(path.join(outDir, 'favicon.ico'), Buffer.concat([iconDir, entry, png32]))
console.log('✓ favicon.ico')
console.log('\nDone!')
