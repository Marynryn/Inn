/**
 * Карточка персонажа, как её отдаёт /api/characters: данные из базы игры
 * плюс огоньки. Один тип на сервер и страницу, чтобы поля не разъезжались.
 */
export type Character = {
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
  description: string[] // абзацы; пусто — блока в карточке нет
  glow: string // цвет подсветки в открытой карточке, по расе
  flames: number
  lit: boolean // огонёк этого читателя
  hidden: boolean // спрятана админом; читателю такие не приходят вовсе
}

/** Фильтры страницы: одна категория — одно выбранное значение, пусто — все. */
export const CHARACTER_FILTERS: { key: 'gender' | 'species' | 'cls' | 'occupation' | 'continent' | 'volume'; label: string }[] = [
  { key: 'gender', label: 'Пол' },
  { key: 'species', label: 'Раса' },
  { key: 'cls', label: 'Класс' },
  { key: 'occupation', label: 'Занятие' },
  { key: 'continent', label: 'Континент' },
  { key: 'volume', label: 'Том' },
]

export type CharacterFilterKey = (typeof CHARACTER_FILTERS)[number]['key']

/** Откуда вылетает открытая карточка: прямоугольник превью на экране в момент клика. */
export type Origin = { x: number; y: number; width: number; height: number }
