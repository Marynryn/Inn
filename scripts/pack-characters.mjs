/**
 * Пересобирает спрятанную базу персонажей для игры «Кто из таверны».
 *
 *   node scripts/pack-characters.mjs [путь-к-исходному-json]
 *
 * Исходник по умолчанию — .data/game/characters.json (папка .data в .gitignore,
 * так что сырой список в репозиторий не попадает). На выходе —
 * server/assets/game/characters.pack: он коммитится, читается только сервером
 * и не поддаётся чтению глазами. Запускать после любой правки исходных данных.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { packCharacters } from '../server/utils/game-pack.ts'

const SRC = resolve(process.argv[2] ?? '.data/game/characters.json')
const OUT = resolve('server/assets/game/characters.pack')

const list = (s) => String(s ?? '').split(';').map(v => v.trim()).filter(Boolean)

const slug = (name) => name
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/['’]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')

const raw = JSON.parse(readFileSync(SRC, 'utf8'))
const seen = new Set()
const packed = []

for (const c of raw) {
  const name = String(c.name ?? '').trim()
  if (!name) continue

  let id = slug(name) || `char-${packed.length}`
  if (seen.has(id)) {
    let n = 2
    while (seen.has(`${id}-${n}`)) n++
    id = `${id}-${n}`
  }
  seen.add(id)

  packed.push({
    id,
    name,
    aliases: list(c.aliases).filter(a => a !== name),
    gender: String(c.gender ?? '').trim(),
    species: list(c.species),
    status: String(c.status ?? '').trim(),
    affiliation: list(c.affiliation),
    continent: list(c.continent),
    locations: list(c.locations),
    occupation: list(c.occupation),
    cls: list(c.class),
    volume: Number(c.first_volume) || 0,
    difficulty: Number(c.difficulty) || 6,
    mentions: Number(c.mentions) || 0,
    image: String(c.image_url ?? '').trim(),
  })
}

writeFileSync(OUT, packCharacters(packed), 'utf8')

const byDifficulty = {}
for (const c of packed) byDifficulty[c.difficulty] = (byDifficulty[c.difficulty] ?? 0) + 1

const gaps = packed.filter(c => !c.gender || !c.status || !c.species.length || !c.volume)

console.log(`Персонажей: ${packed.length}`)
console.log(`По сложности: ${JSON.stringify(byDifficulty)}`)
console.log(`С пропусками в ключевых полях: ${gaps.length}${gaps.length ? ` (${gaps.slice(0, 5).map(c => c.name).join(', ')}…)` : ''}`)
console.log(`Записано: ${OUT}`)
