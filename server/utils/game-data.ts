import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GAME_LAST_VOLUME } from '#shared/utils/gameColumns'
import { fullNameOf, unpackCharacters, type PackedCharacter } from './game-pack'

/**
 * База персонажей для игры. Живёт только на сервере: файл лежит в server/assets,
 * в клиентский бандл не попадает, наружу отдаются лишь имена (для подсказок ввода)
 * и разборы уже сделанных попыток. Загаданный персонаж не покидает сервер, пока
 * игрок его не угадает или не сдастся.
 */

export type GameCharacter = PackedCharacter

export type Pool = 'known' | 'all'

/** Пул «известные» — сложность 1–2 из вики: те, кого читатель встречал не раз. */
const POOLS: Record<Pool, (c: GameCharacter) => boolean> = {
  known: c => c.difficulty <= 2,
  all: () => true,
}

/** Персонаж дня берётся из лёгкого пула: иначе угадать нереально. */
export const DAILY_POOL: Pool = 'known'

export const isPool = (v: unknown): v is Pool => v === 'known' || v === 'all'

type Glossary = {
  names: Record<string, string>
  fullNames: Record<string, string>
  terms: Record<string, string>
}

let charactersCache: GameCharacter[] | null = null
let glossaryCache: Glossary | null = null

/**
 * Файлы из server/assets Nitro кладёт в собранный сервер и отдаёт через useStorage.
 * В dev тот же путь читается с диска — на случай, если стораж ещё не прогрет.
 */
async function readAsset(name: string): Promise<unknown> {
  try {
    const item = await useStorage('assets:server').getItem(`game/${name}`)
    if (item) return item
  } catch {
    // упадём в чтение с диска ниже
  }
  return readFileSync(resolve('server/assets/game', name), 'utf8')
}

/** В сборке ассет приезжает байтами, в dev — строкой; наружу всегда текст. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8')
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString('utf8')
  return JSON.stringify(value)
}

export async function allCharacters(): Promise<GameCharacter[]> {
  if (!charactersCache) {
    charactersCache = unpackCharacters(asText(await readAsset('characters.pack')))
  }
  return charactersCache
}

export async function useGlossary(): Promise<Glossary> {
  // В dev словарь перечитывается каждый раз: правку имён видно без перезапуска.
  if (glossaryCache && !import.meta.dev) return glossaryCache

  // unstorage может отдать .json уже разобранным объектом, а может — байтами.
  const raw = await readAsset('glossary.json')
  const plainObject = typeof raw === 'object' && raw !== null && !(raw instanceof Uint8Array) && !(raw instanceof ArrayBuffer)
  const parsed = (plainObject ? raw : JSON.parse(asText(raw))) as Partial<Glossary>

  glossaryCache = {
    names: parsed.names ?? {},
    fullNames: parsed.fullNames ?? {},
    terms: parsed.terms ?? {},
  }
  return glossaryCache
}

/**
 * Имя персонажа по-русски — с фамилией, если она есть в глоссарии: искать по
 * «Весностранница» нужно не меньше, чем по «Сирия». Нет перевода — показываем
 * оригинал, тоже полным именем.
 */
export const ruName = (c: GameCharacter, g: Glossary) =>
  g.fullNames[c.name] ?? g.names[c.name] ?? fullNameOf(c)

/** Значение признака по-русски; нет в глоссарии — показываем оригинал. */
export const ruTerm = (value: string, g: Glossary) => g.terms[value] ?? value

/** Потолок тома: 1..10, что угодно кривое — последний том. */
export const clampVolume = (value: unknown) => {
  const n = Math.trunc(Number(value))
  return n >= 1 && n <= GAME_LAST_VOLUME ? n : GAME_LAST_VOLUME
}

/**
 * Набор персонажей: сложность плюс потолок тома. Том — это защита от спойлеров,
 * поэтому он режет не только загадываемого, но и подсказки ввода: назвать того,
 * кто появится позже прочитанного, нельзя — иначе игрок сам себе всё раскроет.
 *
 * Имена, которых нет в глоссарии, остаются в оригинале: их показываем латиницей
 * и по ней же ищем, поиск разбирает оба написания.
 */
export async function poolCharacters(pool: Pool, maxVolume = GAME_LAST_VOLUME): Promise<GameCharacter[]> {
  const cap = clampVolume(maxVolume)
  return (await allCharacters()).filter(c => c.volume <= cap && POOLS[pool](c))
}

export async function findCharacter(id: string, pool: Pool, maxVolume?: number): Promise<GameCharacter | null> {
  return (await poolCharacters(pool, maxVolume)).find(c => c.id === id) ?? null
}

/**
 * Поиск по всей базе, без оглядки на пул: нужен, чтобы поднять начатую партию,
 * даже если набор персонажей с тех пор поменялся. Новые попытки всё равно
 * проверяются по пулу.
 */
export async function findAnyCharacter(id: string): Promise<GameCharacter | null> {
  return (await allCharacters()).find(c => c.id === id) ?? null
}

/** Случайный персонаж пула — для свободного режима. */
export async function randomCharacter(pool: Pool, maxVolume?: number): Promise<GameCharacter> {
  const list = await poolCharacters(pool, maxVolume)
  return list[Math.floor(Math.random() * list.length)]!
}

const gameSecret = () => {
  const config = useRuntimeConfig()
  return config.gameSecret || config.sessionPassword || 'wandering-inn-game'
}

/** Детерминированный ГПСЧ: одна и та же строка-семя всегда даёт ту же последовательность. */
function seededRandom(seed: string) {
  let block = createHash('sha256').update(seed).digest()
  let offset = 0
  return () => {
    if (offset + 4 > block.length) {
      block = createHash('sha256').update(block).digest()
      offset = 0
    }
    const value = block.readUInt32BE(offset)
    offset += 4
    return value / 0x1_0000_0000
  }
}

const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000)

/**
 * Персонаж дня. Пул тасуется по секрету и номеру круга, день берёт следующего по
 * порядку — так внутри круга (это ~200 дней) никто не повторяется, а вычислить
 * завтрашнего снаружи нельзя: семя замешано на серверном секрете.
 */
export async function dailyCharacter(day: string, maxVolume: number): Promise<GameCharacter> {
  const cap = clampVolume(maxVolume)
  const list = await poolCharacters(DAILY_POOL, cap)
  const index = dayNumber(day)
  const cycle = Math.floor(index / list.length)

  const order = list.map(c => c.id)
  const random = seededRandom(
    createHmac('sha256', gameSecret()).update(`${DAILY_POOL}:${cap}:${cycle}`).digest('hex'),
  )
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }

  const id = order[((index % list.length) + list.length) % list.length]!
  return list.find(c => c.id === id)!
}
