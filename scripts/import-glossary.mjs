/**
 * Собирает словарь игры из рабочего глоссария перевода (xlsx с листом
 * «Английский | Русский | Примечание»).
 *
 *   node scripts/import-glossary.mjs [путь-к-xlsx]
 *
 * По умолчанию берёт .data/game/glossary.xlsx (папка в .gitignore). На выходе —
 * server/assets/game/glossary.json: только те имена и термины, которые реально
 * встречаются в базе персонажей. Чего нет в глоссарии — то и остаётся
 * по-английски, как договаривались.
 */
import JSZip from 'jszip'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { unpackCharacters } from '../server/utils/game-pack.ts'

const SRC = resolve(process.argv[2] ?? '.data/game/glossary.xlsx')
const PACK = resolve('server/assets/game/characters.pack')
const OUT = resolve('server/assets/game/glossary.json')

/**
 * Запасной перевод — только для служебных категорий самой вики (пол, статус,
 * класс, занятие). Это не термины книги, в глоссарии их и нет, а показывать
 * «Non-combat» в русской таблице некрасиво. Глоссарий всегда важнее: сюда
 * заглядываем, только если там ничего не нашлось. Не нужно — удали словарь.
 */
const FALLBACK = {
  // пол
  Male: 'Мужской',
  Female: 'Женский',
  Nonbinary: 'Небинарный',
  // статус
  Alive: 'Жив',
  Deceased: 'Мёртв',
  Active: 'Действует',
  Unknown: 'Неизвестно',
  // класс
  Warrior: 'Воин',
  Mage: 'Маг',
  Archer: 'Лучник',
  Rogue: 'Плут',
  Priest: 'Жрец',
  Leader: 'Лидер',
  God: 'Бог',
  'Non-combat': 'Небоевой',
  // занятие
  Adventurer: 'Авантюрист',
  Alchemist: 'Алхимик',
  Ambassador: 'Посол',
  Archmage: 'Архимаг',
  Artisan: 'Ремесленник',
  Assassin: 'Убийца',
  Bard: 'Бард',
  Centenium: 'Центениум',
  Chef: 'Повар',
  Chieftain: 'Вождь',
  Child: 'Ребёнок',
  Courier: 'Курьер',
  Crime: 'Криминал',
  Death: 'Смерть',
  Doctor: 'Врач',
  Druid: 'Друид',
  Enchanter: 'Зачарователь',
  Farmer: 'Фермер',
  General: 'Генерал',
  Guard: 'Стражник',
  Hero: 'Герой',
  Innkeeper: 'Хозяин таверны',
  Intellect: 'Учёный',
  Knight: 'Рыцарь',
  Layabout: 'Бездельник',
  Maid: 'Горничная',
  Mayor: 'Управитель',
  Merchant: 'Торговец',
  Monarch: 'Правитель',
  News: 'Новости',
  Noble: 'Аристократ',
  Performer: 'Артист',
  Pirate: 'Пират',
  Prognugator: 'Прогнугатор',
  Royal: 'Королевская особа',
  Runner: 'Бегун',
  Sailor: 'Моряк',
  Secretary: 'Секретарь',
  Shaman: 'Шаман',
  Slave: 'Раб',
  Smith: 'Кузнец',
  Soldier: 'Солдат',
  Spy: 'Шпион',
  Strategist: 'Стратег',
  Stategist: 'Стратег', // опечатка в исходных данных вики
  Vassal: 'Вассал',
  Witch: 'Ведьма',
}

// ── Чтение xlsx ────────────────────────────────────────────
const unescapeXml = s => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&amp;/g, '&')

function sheetRows(xml) {
  const rows = []
  for (const rowXml of xml.match(/<row[\s\S]*?<\/row>/g) ?? []) {
    const cells = []
    for (const cell of rowXml.match(/<c [\s\S]*?(?:\/>|<\/c>)/g) ?? []) {
      const ref = cell.match(/r="([A-Z]+)\d+"/)?.[1] ?? ''
      const col = [...ref].reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1
      const text = [...cell.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => unescapeXml(m[1])).join('')
      cells[col] = text
    }
    rows.push(Array.from(cells, v => (v ?? '').trim()))
  }
  return rows
}

// ── Словарь ────────────────────────────────────────────────
/** Ключи сравниваем без регистра, апострофы и пробелы приводим к одному виду. */
const key = s => s
  .replace(/[’‘`]/g, "'")
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

const zip = await JSZip.loadAsync(readFileSync(SRC))
const rows = sheetRows(await zip.file('xl/worksheets/sheet1.xml').async('string'))

const dictionary = new Map()
for (const [en, ru] of rows.slice(1)) {
  if (!en || !ru) continue
  if (!dictionary.has(key(en))) dictionary.set(key(en), ru.trim())
}

/**
 * Виды в глоссарии стоят во множественном числе, а в карточке персонажа нужен
 * один. Единственное число берём отсюда — это тот же перевод, только в другом
 * числе, ничего нового не выдумываем.
 */
const SINGULAR = {
  'Антиниумы': 'Антиниум',
  'Минотавры': 'Минотавр',
  'Драконы': 'Дракон',
  'Гноллы': 'Гнолл',
  'Вампиры': 'Вампир',
  'Кентавры': 'Кентавр',
  'Сариантские ягнята': 'Сариантский ягнёнок',
  'Големы': 'Голем',
  'Наги': 'Нага',
  'Единороги': 'Единорог',
  'Слизни': 'Слизень',
  'Демоны': 'Демон',
  'Дриады': 'Дриада',
  'Элементали': 'Элементаль',
  'Сатиры': 'Сатир',
  'Тренты': 'Трент',
  'Огры': 'Огр',
  'Грифоны': 'Грифон',
  'Гранепреступники': 'Гранепреступник',
  'Гномы': 'Гном',
  'Великаны': 'Великан',
}

/**
 * Ищем перевод по нескольким написаниям одного и того же: классы в глоссарии
 * записаны в скобках ([Innkeeper]), виды — во множественном числе (Minotaurs),
 * названия иногда без артикля. Ничего не выдумываем — только другие написания.
 */
function translate(value) {
  const bare = value.replace(/^\[|\]$/g, '')
  const variants = [
    value,
    `[${bare}]`,
    bare,
    `${bare}s`,
    `${bare}es`,
    bare.replace(/^The\s+/i, ''),
    `The ${bare}`,
  ]

  for (const variant of variants) {
    const found = dictionary.get(key(variant))
    if (!found) continue

    const clean = found.replace(/^\[|\]$/g, '').trim()
    return SINGULAR[clean] ?? clean
  }
  return null
}

// ── Что вообще нужно игре ──────────────────────────────────
const characters = unpackCharacters(readFileSync(PACK, 'utf8'))

const names = {}
const missingNames = []

for (const c of characters) {
  // Сначала само имя, потом полное имя из псевдонимов («Erin» → «Erin Solstice»):
  // прозвища не берём, иначе в списке окажется титул вместо имени.
  const candidates = [c.name, ...c.aliases.filter(a => a.startsWith(`${c.name} `))]
  const hit = candidates.map(translate).find(Boolean)

  if (hit) names[c.name] = hit
  else missingNames.push(c.name)
}

const terms = {}
const missingTerms = new Set()
let fromFallback = 0

for (const c of characters) {
  for (const value of [c.gender, c.status, ...c.species, ...c.affiliation, ...c.continent, ...c.occupation, ...c.cls]) {
    if (!value || terms[value]) continue

    const hit = translate(value)
    if (hit) {
      terms[value] = hit
    } else if (FALLBACK[value]) {
      terms[value] = FALLBACK[value]
      fromFallback++
    } else {
      missingTerms.add(value)
    }
  }
}

const sorted = obj => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))

writeFileSync(OUT, `${JSON.stringify({
  _readme: [
    'Словарь игры «Кто из таверны». Собирается из рабочего глоссария перевода:',
    'node scripts/import-glossary.mjs [путь-к-xlsx]. Правки руками переживут только',
    'до следующего запуска импорта — лучше править сам глоссарий.',
    'names — имена персонажей, terms — виды, организации, континенты, занятия, классы.',
    'Чего здесь нет, то показывается по-английски. Сервер читает файл на лету.',
  ],
  names: sorted(names),
  terms: sorted(terms),
}, null, 2)}\n`, 'utf8')

const pct = (n, total) => `${Math.round((n / total) * 100)}%`

console.log(`Строк в глоссарии: ${dictionary.size}`)
console.log(`Имена: ${Object.keys(names).length} из ${characters.length} (${pct(Object.keys(names).length, characters.length)})`)
console.log(`Термины: ${Object.keys(terms).length} (из них ${fromFallback} служебных, не из глоссария), без перевода осталось ${missingTerms.size}`)
console.log(`Без перевода (примеры имён): ${missingNames.slice(0, 8).join(', ')}`)
console.log(`Без перевода (примеры терминов): ${[...missingTerms].slice(0, 8).join(', ')}`)
console.log(`Записано: ${OUT}`)
