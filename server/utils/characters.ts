import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { allCharacters, ruName, ruTerm, useGlossary, type GameCharacter } from './game-data'
import { fullNameOf } from './game-pack'
import { readServerAssetOrEmpty } from './server-assets'

/**
 * Карточки персонажей. Берутся из той же базы, что и игра, но не все: только
 * известные (сложность 1–2) и только из первых томов — те, кого читатель
 * перевода точно встречал. Связи, статус и число упоминаний наружу не выходят:
 * карточки — это не решатель для игры.
 */

/** До какого тома включительно показываем персонажей. */
export const CARDS_LAST_VOLUME = 4

export type CharacterCard = {
  id: string
  name: string
  original: string
  gender: string
  age: string // как в вики; пусто — на карточке прочерк
  species: string[]
  cls: string[]
  occupation: string[]
  continent: string[]
  locations: string[]
  volume: number
  image: string | null // /characters/<id>.webp, если файл положили; иначе плейсхолдер
  full: string | null // та же картинка целиком, если её положили в full/
  description: string[] // абзацы; пусто — блока в карточке нет
  glow: string[] // цвета подсветки в открытой карточке, по расе: один или переливом
}

/**
 * Подсветка по расе — палитра из «Подсветка.html» (01.10.2026). Ключ — раса в
 * оригинале, первая из списка (у хобгоблинов она «Hobgoblin»). Цвет один или
 * несколько: у Люцифенов и Единорогов свечение переливается, и карточка
 * разносит цвета по краям. Кого в списке нет — греется у очага, цветом угля.
 */
const GLOW_DEFAULT = ['#d6883e']
const GLOW_BY_SPECIES: Record<string, string[]> = {
  'Human': ['#F5C518'],
  'God': ['#111111'],
  'Goblin': ['#2E9E44'],
  'Hobgoblin': ['#2E9E44'],
  'Drake': ['#A6E22E'],
  'Fae': ['#30D5C8'],
  'Gnoll': ['#C9A27E'],
  'Antinium': ['#5D3A1A'],
  'Half-Gazer': ['#FF8A1F'],
  'Dragon': ['#E53935'],
  'Ashfire Bee': ['#E53935'],
  'Undead': ['#8E44AD'],
  'Golem': ['#FFFFFF'],
  'Troll': ['#FFFFFF'],
  'Half-Troll': ['#FFFFFF'],
  'Ogre': ['#FFFFFF'],
  'Cyclops': ['#FFFFFF'],
  'Half-Giant': ['#8A7F72'],
  'Fraerling': ['#F8A5C2'],
  'Halfling': ['#F8A5C2'],
  'Sariant Lamb': ['#F8A5C2'],
  'Demon': ['#D81B60'],
  'Lucifen': ['#2B2B2B', '#D4A017'],
  'Minotaur': ['#7B1E2B'],
  'Dwarf': ['#B0602A'],
  'Selphid': ['#FF7A6B'],
  'Djinni': ['#1E63D6'],
  'Djinn': ['#1E63D6'],
  'Jinn': ['#1E63D6'],
  'Garuda': ['#7FD3FF'],
  'Drowned Person': ['#0B2E6B'],
  'Dullahan': ['#6E8796'],
  'Half-Elf': ['#B8A6F0'],
  'Gnome': ['#B8A6F0'],
  'Lizardfolk': ['#12A37F'],
  'Naga': ['#12A37F'],
  'Beastkin': ['#8C8A3E'],
  'Centaur': ['#8C8A3E'],
  'Satyr': ['#8C8A3E'],
  'String Person': ['#E6D3B3'],
  'Unicorn': ['#FFFFFF', '#F8C8E8', '#BDE0FE'],
}

const glowOf = (species: string[]) => GLOW_BY_SPECIES[species[0] ?? ''] ?? GLOW_DEFAULT

type Extra = {
  description: string[]
  locations: string[] | null
}

const isCardCharacter = (c: GameCharacter) => c.difficulty <= 2 && c.volume >= 1 && c.volume <= CARDS_LAST_VOLUME

/**
 * Файл описаний — server/assets/characters/descriptions.md. Заголовок «## Имя»
 * (имя в оригинале, как в базе), под ним текст абзацами через пустую строку.
 * Необязательная строка «Локации: …» через точку с запятой подменяет список из
 * базы целиком — так можно убрать лишнее или переименовать, не трогая базу.
 */
export function parseDescriptions(text: string): Map<string, Extra> {
  const out = new Map<string, Extra>()
  let current: Extra | null = null
  let paragraph: string[] = []
  let inComment = false

  const flush = () => {
    if (current && paragraph.length) current.description.push(paragraph.join(' '))
    paragraph = []
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    // HTML-комментарии — пометки для того, кто правит файл, наружу не идут.
    if (inComment || line.startsWith('<!--')) {
      inComment = !line.includes('-->')
      continue
    }
    const heading = /^##\s+(.+)$/.exec(line)
    if (heading) {
      flush()
      current = { description: [], locations: null }
      out.set(heading[1]!.trim(), current)
      continue
    }
    if (!current) continue

    const locations = /^Локации:\s*(.*)$/i.exec(line)
    if (locations) {
      flush()
      current.locations = locations[1]!.split(';').map(s => s.trim()).filter(Boolean)
      continue
    }
    if (!line) {
      flush()
      continue
    }
    paragraph.push(line)
  }
  flush()
  return out
}

let extrasCache: Map<string, Extra> | null = null

async function useExtras(): Promise<Map<string, Extra>> {
  // В dev файл перечитывается каждый раз: правку описания видно без перезапуска.
  if (extrasCache && !import.meta.dev) return extrasCache
  extrasCache = parseDescriptions(await readServerAssetOrEmpty('characters/descriptions.md'))
  return extrasCache
}

/**
 * Картинки лежат в public/characters/<id>.webp и добавляются по одной — без
 * списка на сервере карточка не узнает, есть ли файл, а стучаться за каждой
 * картинкой и ловить 404 не хочется. Папки может не быть вовсе.
 *
 * Рядом, в public/characters/full/<id>.webp, лежит та же картинка целиком:
 * портрет в карточке квадратный, и высокий рисунок пришлось бы обрезать. Полная
 * есть не у всех — у кого её нет, увеличивается сама карточка.
 */
const idsCache = new Map<string, Set<string>>()

function webpIds(dir: string): Set<string> {
  const cached = idsCache.get(dir)
  if (cached && !import.meta.dev) return cached
  let ids: Set<string>
  try {
    ids = new Set(
      readdirSync(resolve(dir))
        .filter(f => f.endsWith('.webp'))
        .map(f => f.slice(0, -'.webp'.length)),
    )
  } catch {
    ids = new Set()
  }
  idsCache.set(dir, ids)
  return ids
}

let cardsCache: CharacterCard[] | null = null

export async function characterCards(): Promise<CharacterCard[]> {
  if (cardsCache && !import.meta.dev) return cardsCache

  const glossary = await useGlossary()
  const extras = await useExtras()
  const images = webpIds('public/characters')
  const fulls = webpIds('public/characters/full')
  const term = (v: string) => ruTerm(v, glossary)

  cardsCache = (await allCharacters())
    .filter(isCardCharacter)
    .map((c) => {
      const extra = extras.get(c.name)
      return {
        id: c.id,
        name: ruName(c, glossary),
        original: fullNameOf(c),
        gender: term(c.gender),
        age: c.age,
        species: c.species.map(term),
        cls: c.cls.map(term),
        occupation: c.occupation.map(term),
        continent: c.continent.map(term),
        locations: extra?.locations ?? c.locations.map(term),
        volume: c.volume,
        image: images.has(c.id) ? `/characters/${c.id}.webp` : null,
        // Без картинки целиком увеличиваем саму карточку: посмотреть портрет
        // крупно хочется у каждого, а полная версия есть не у всех.
        full: fulls.has(c.id)
          ? `/characters/full/${c.id}.webp`
          : images.has(c.id) ? `/characters/${c.id}.webp` : null,
        description: extra?.description ?? [],
        glow: glowOf(c.species),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  return cardsCache
}
