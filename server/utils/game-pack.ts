import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'

/**
 * Формат «спрятанной» базы персонажей для игры.
 *
 * Файл server/assets/game/characters.pack — это gzip поверх JSON, поверх которого
 * прогнан XOR с потоком из sha256-цепочки. Это не шифрование: ключ лежит рядом,
 * в исходниках. Задача другая — чтобы база не читалась глазами ни в репозитории,
 * ни в собранном сервере, и чтобы её нельзя было выкачать целиком, случайно
 * заглянув в сетевую вкладку. От игрока база спрятана надёжно: браузер не
 * получает ни файл, ни ответ дня — только сравнения по уже сделанным попыткам.
 *
 * Кодек живёт в одном месте: его импортируют и сервер, и scripts/pack-characters.mjs.
 */

export type PackedCharacter = {
  id: string
  name: string
  aliases: string[]
  gender: string
  species: string[]
  status: string
  affiliation: string[]
  continent: string[]
  locations: string[]
  occupation: string[]
  cls: string[]
  volume: number
  difficulty: number
  mentions: number
  image: string
}

const MAGIC = 'WIP1:'
const SEED = 'wanderdle:pack:v1'

/** Служебные слова титулов: «Klbkch the Slayer» — не фамилия. */
const TITLE_WORDS = new Set(['the', 'of', 'du', 'de', 'von', 'van', 'val', 'sor', 'soth', 'and'])

/**
 * Полное имя персонажа среди псевдонимов: «Erin» → «Erin Solstice». Берём только
 * то, где после имени идёт слово с большой буквы, — так отсеиваются титулы
 * («Ksmvr of Chandrar»), которые фамилией не являются. Нет такого псевдонима —
 * возвращаем само имя.
 *
 * Живёт рядом с форматом данных: этим пользуются и сервер, и импорт глоссария.
 */
export function fullNameOf(c: Pick<PackedCharacter, 'name' | 'aliases'>): string {
  const found = c.aliases.find((a) => {
    if (!a.startsWith(`${c.name} `)) return false
    const next = a.slice(c.name.length + 1).split(' ')[0] ?? ''
    return Boolean(next) && !TITLE_WORDS.has(next.toLowerCase()) && next[0] === next[0]!.toUpperCase()
  })
  return found ?? c.name
}

function keystream(length: number): Buffer {
  const out = Buffer.alloc(length)
  let block = createHash('sha256').update(SEED).digest()
  let offset = 0
  while (offset < length) {
    block.copy(out, offset)
    offset += block.length
    block = createHash('sha256').update(block).digest()
  }
  return out
}

function xor(buf: Buffer): Buffer {
  const ks = keystream(buf.length)
  for (let i = 0; i < buf.length; i++) buf[i]! ^= ks[i]!
  return buf
}

export function packCharacters(list: PackedCharacter[]): string {
  const body = xor(gzipSync(Buffer.from(JSON.stringify(list), 'utf8'), { level: 9 })).toString('base64')
  // Ломаем base64 на строки: иначе git хранит базу одной строкой в несколько сотен килобайт.
  const lines = body.match(/.{1,120}/g) ?? []
  return `${MAGIC}\n${lines.join('\n')}\n`
}

export function unpackCharacters(text: string): PackedCharacter[] {
  const body = text.replace(MAGIC, '').replace(/\s+/g, '')
  return JSON.parse(gunzipSync(xor(Buffer.from(body, 'base64'))).toString('utf8'))
}
