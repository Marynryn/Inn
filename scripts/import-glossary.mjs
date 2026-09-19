/**
 * Собирает словарь игры из рабочего глоссария перевода (xlsx с листом
 * «Английский | Русский | Примечание»).
 *
 *   node scripts/import-glossary.mjs [пути-к-xlsx…]
 *
 * По умолчанию берёт .data/game/glossary.xlsx и, если он есть, дополнение для
 * карточек .data/game/glossary-cards.xlsx (папка в .gitignore). Файлов может
 * быть несколько: первый перевод найденного слова и выигрывает, так что рабочий
 * глоссарий идёт первым, а дополнение только закрывает его пробелы.
 *
 * На выходе — server/assets/game/glossary.json: только те имена и термины,
 * которые реально встречаются в базе персонажей. Чего нет в глоссарии — то и
 * остаётся по-английски, как договаривались.
 */
import JSZip from 'jszip'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fullNameOf, unpackCharacters } from '../server/utils/game-pack.ts'

const DEFAULT_SRCS = ['.data/game/glossary.xlsx', '.data/game/glossary-cards.xlsx']
const given = process.argv.slice(2)
const SRCS = (given.length ? given : DEFAULT_SRCS.filter(existsSync)).map(p => resolve(p))
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
  // связи: служебное значение вики, не название организации
  Unaffiliated: 'Без связей',
  // виды: звери и общефэнтезийные слова, названий книги здесь нет
  Cat: 'Кошка',
  Rodent: 'Грызун',
  Eagle: 'Орёл',
  Wolf: 'Волк',
  Horse: 'Лошадь',
  Camel: 'Верблюд',
  Orangutan: 'Орангутан',
  Pegasus: 'Пегас',
  Gorgon: 'Горгона',
  Mimic: 'Мимик',
  Djinn: 'Джинн',
  Merman: 'Тритон',
  Halfling: 'Полурослик',
  Lamia: 'Ламия',
  'Star Lamia': 'Звёздная ламия',
  Mind: 'Разум',
  'The Minds': 'Разумы',
  // континенты и края: обычные слова, а не имена собственные
  Sea: 'Море',
  Isles: 'Острова',
  'North America': 'Северная Америка',
  // те, кого вики зовёт общим словом
  Earthers: 'Земляне',
  Immortals: 'Бессмертные',
  Witches: 'Ведьмы',
  'United Nations': 'ООН',
  // описательные названия вики: гильдии, стража, школа — не имена собственные
  "Liscor's City Watch": 'Городская стража Лискора',
  "Liscor's Dungeon": 'Подземелье Лискора',
  "Liscor's Adventurer Guild": 'Гильдия авантюристов Лискора',
  "Liscor's Adventurer's Guild": 'Гильдия авантюристов Лискора',
  "Liscor's Second Army": 'Вторая армия Лискора',
  "Alchemist's Guild": 'Гильдия алхимиков',
  "Blacksmith's Guild": 'Гильдия кузнецов',
  'Guild of Smiths': 'Гильдия кузнецов',
  "Runner Guild's": 'Гильдия бегунов',
  'Wistram News Network': 'Новостная сеть Вистрама',
  'Wistram Earthers': 'Земляне Вистрама',
  "Titan's School": 'Школа Титана',
  'Demon Kingdom': 'Королевство Демонов',
  'Isle of Goblins': 'Остров гоблинов',
  'House Welfar': 'Дом Веллфар', // опечатка в исходных данных вики
}

// ── Чтение xlsx ────────────────────────────────────────────
const unescapeXml = s => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&amp;/g, '&')

/**
 * Текст ячейки xlsx хранится двумя способами, и оба нам попадались: прямо в
 * ячейке (inlineStr — так отдаёт Excel) или ссылкой в общую таблицу строк
 * (t="s" — так выгружает Google Sheets). Разбираем и то, и другое.
 */
function sharedStrings(xml) {
  if (!xml) return []
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => unescapeXml(t[1])).join(''),
  )
}

function sheetRows(xml, strings = []) {
  const rows = []
  for (const rowXml of xml.match(/<row[\s\S]*?<\/row>/g) ?? []) {
    const cells = []
    for (const cell of rowXml.match(/<c [\s\S]*?(?:\/>|<\/c>)/g) ?? []) {
      const ref = cell.match(/r="([A-Z]+)\d+"/)?.[1] ?? ''
      const col = [...ref].reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1

      const inline = [...cell.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => unescapeXml(m[1])).join('')
      const shared = cell.includes('t="s"') ? strings[Number(cell.match(/<v>(\d+)<\/v>/)?.[1])] : null

      cells[col] = inline || shared || ''
    }
    rows.push(Array.from(cells, v => (v ?? '').trim()))
  }
  return rows
}

// ── Словарь ────────────────────────────────────────────────
/**
 * Ключи сравниваем без регистра, апострофы и пробелы приводим к одному виду, а
 * диакритику снимаем: вики пишет «Walchais», глоссарий — «Walchaís», и это одна
 * и та же фамилия.
 */
const key = s => s
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[’‘`]/g, "'")
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

/**
 * Берём только словарные листы. В рабочей книге рядом со словарём лежат
 * «Обращения» и «Решения»: там в двух первых столбцах русский и русский, и
 * попади они сюда, переводы бы поехали. Словарь узнаём по заголовку —
 * «Английский | Русский» или «Локация (EN) | Перевод (RU)».
 */
const isDictionarySheet = header =>
  /англ|english|\(en\)/i.test(header[0] ?? '') && /рус|\(ru\)|перевод/i.test(header[1] ?? '')

const rows = []
for (const src of SRCS) {
  const zip = await JSZip.loadAsync(readFileSync(src))
  const strings = sharedStrings(await zip.file('xl/sharedStrings.xml')?.async('string'))
  const sheets = Object.keys(zip.files)
    .filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))

  let taken = 0
  const skipped = []
  for (const name of sheets) {
    const sheet = sheetRows(await zip.file(name).async('string'), strings).filter(r => r.some(Boolean))
    if (sheet.length < 2) continue
    if (!isDictionarySheet(sheet[0])) {
      skipped.push(`${sheet[0][0] || '?'} | ${sheet[0][1] || '?'}`)
      continue
    }
    rows.push(...sheet.slice(1))
    taken += sheet.length - 1
  }
  console.log(`${basename(src)}: строк ${taken}${skipped.length ? `, мимо словаря: ${skipped.join('; ')}` : ''}`)
}

if (!rows.length) {
  console.error(`Словарных листов не нашлось. Проверь, что ${SRCS.map(basename).join(', ')} — это глоссарий, а не другой файл.`)
  process.exit(1)
}

const dictionary = new Map()
for (const [en, ru] of rows) {
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
function plain(value) {
  const bare = value.replace(/^\[|\]$/g, '')
  const variants = [
    value,
    `[${bare}]`,
    bare,
    `${bare}s`,
    `${bare}es`,
    bare.replace(/^The\s+/i, ''),
    `The ${bare}`,
    // Вики зовёт вид одним человеком, глоссарий — народом: «Drowned Person» и
    // «Drowned Man» — одни и те же утопшие.
    bare.replace(/\bPerson$/, 'Man'),
    bare.replace(/\bPerson$/, 'People'),
    bare.replace(/\bPeople$/, 'Person'),
  ]

  for (const variant of variants) {
    const found = dictionary.get(key(variant))
    if (!found) continue

    const clean = found.replace(/^\[|\]$/g, '').trim()
    return SINGULAR[clean] ?? clean
  }
  return null
}

/**
 * Фамилия, известная глоссарию только в паре с именем: там записана «Bethal
 * Walchais», а вики пишет «House Walchais». Берём последнее слово перевода —
 * это и есть фамилия. Годится лишь для домов и семей: у ордена или королевства
 * за тем же словом стоит вовсе не человек.
 */
function surname(word) {
  if (/\s/.test(word)) return null

  const tail = ` ${key(word)}`
  for (const [en, ru] of dictionary) {
    if (!en.endsWith(tail) || en.split(' ').length > 3) continue

    // Отбрасываем ровно столько первых слов перевода, сколько слов стоит перед
    // фамилией в оригинале: у «Bealt Gemscale» это имя, и остаётся вся фамилия
    // целиком — «Самоцветная Чешуя», а не одно последнее слово.
    const words = ru.trim().split(/\s+/)
    // Перевод бывает короче оригинала («Isles of Minos» — «Острова Миноса»):
    // тогда фамилией остаётся последнее слово.
    const found = words.slice(en.split(' ').length - 1).join(' ') || words.at(-1)
    if (found) return found
  }
  return null
}

/**
 * Составные названия вики: «House Veltras», «Plain's Eye Tribe», «Kingdom of
 * Hellios». Глоссарий знает только саму фамилию или племя — русское слово
 * ставим по образцу, а имя собственное берём из глоссария. Не нашлась часть —
 * не выдумываем и уходим ни с чем.
 */
const COMPOUNDS = [
  [/^House of (.+)$/i, 'Дом', true],
  [/^House (.+)$/i, 'Дом', true],
  [/^(.+) [Ff]amily$/, 'Семья', true],
  [/^(.+) Clan$/, 'Клан', true],
  [/^(.+) Tribe$/, 'Племя', false],
  [/^Kingdom of (.+)$/i, 'Королевство', false],
  [/^Order of the (.+)$/i, 'Орден', false],
  [/^Order of (.+)$/i, 'Орден', false],
]

function translate(value) {
  const direct = plain(value)
  if (direct) return direct

  for (const [pattern, word, byPerson] of COMPOUNDS) {
    const inner = pattern.exec(value)?.[1]
    if (!inner) continue

    const ru = plain(inner) ?? (byPerson ? surname(inner) : null)
    if (ru) return `${word} ${ru}`
  }
  return null
}

// ── Что вообще нужно игре ──────────────────────────────────
const characters = unpackCharacters(readFileSync(PACK, 'utf8'))

const names = {}
const fullNames = {}
const missingNames = []

for (const c of characters) {
  const full = fullNameOf(c)

  const short = translate(c.name)
  // Только точное совпадение всей строки: складывать имя с фамилией из разных
  // записей нельзя — глоссарий полон похожих строк, и выходит чужая фамилия.
  const whole = full !== c.name ? translate(full) : null

  if (short) names[c.name] = short
  if (whole && whole !== short) fullNames[c.name] = whole

  if (!short && !whole) missingNames.push(c.name)
  else if (!short && whole) names[c.name] = whole
}

const terms = {}
const missingTerms = new Set()
let fromFallback = 0

for (const c of characters) {
  // Локации тоже переводятся через terms: в карточке персонажа это отдельная
  // строка, и без них «Bloodfields» и «High Passes» стояли бы по-английски.
  for (const value of [c.gender, c.status, ...c.species, ...c.affiliation, ...c.continent, ...c.occupation, ...c.cls, ...c.locations]) {
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
    'node scripts/import-glossary.mjs [пути-к-xlsx…]. Правки руками переживут только',
    'до следующего запуска импорта — лучше править сам глоссарий.',
    'names — короткие имена, fullNames — имя с фамилией (показываем его, если есть),',
    'terms — виды, организации, континенты, занятия, классы, локации.',
    'Чего здесь нет, то показывается по-английски. Сервер читает файл на лету.',
  ],
  names: sorted(names),
  fullNames: sorted(fullNames),
  terms: sorted(terms),
}, null, 2)}\n`, 'utf8')

const pct = (n, total) => `${Math.round((n / total) * 100)}%`

console.log(`Строк в глоссарии: ${dictionary.size}`)
console.log(`Имена: ${Object.keys(names).length} из ${characters.length} (${pct(Object.keys(names).length, characters.length)})`)
console.log(`Имена с фамилией: ${Object.keys(fullNames).length}`)
console.log(`Термины: ${Object.keys(terms).length} (из них ${fromFallback} служебных, не из глоссария), без перевода осталось ${missingTerms.size}`)
console.log(`Без перевода (примеры имён): ${missingNames.slice(0, 8).join(', ')}`)
console.log(`Без перевода (примеры терминов): ${[...missingTerms].slice(0, 8).join(', ')}`)

// Список того, что осталось по-английски, — рядом с самим глоссарием: это
// готовый перечень строк, которые стоит завести в рабочем файле перевода.
const TODO = resolve('.data/game/to-translate-terms.txt')
writeFileSync(TODO, `${[...missingTerms].sort((a, b) => a.localeCompare(b)).join('\n')}\n`, 'utf8')

console.log(`Записано: ${OUT}`)
console.log(`Список без перевода: ${TODO}`)
