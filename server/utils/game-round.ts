import {
  GAME_COLUMNS,
  GAME_LAST_VOLUME,
  GAME_SPOILER_COLUMNS,
  type GameCell,
  type GameColumnKey,
  type GameGuessRow,
} from '#shared/utils/gameColumns'
import { ruName, ruTerm, useGlossary, type GameCharacter } from './game-data'

/**
 * Разбор одной попытки. Наружу уходит только то, что игрок и так уже назвал:
 * признаки названного персонажа плюс вердикт по каждому. Сам загаданный
 * персонаж в ответе не появляется — ни целиком, ни по кусочкам.
 */

const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every(v => b.includes(v))

function multiCell(guess: string[], answer: string[], ru: (v: string) => string): GameCell {
  const values = guess.map(ru)

  if (same(guess, answer)) return { values, verdict: 'hit' }
  if (guess.some(v => answer.includes(v))) return { values, verdict: 'partial' }
  return { values, verdict: 'miss' }
}

function singleCell(guess: string, answer: string, ru: (v: string) => string): GameCell {
  return {
    values: guess ? [ru(guess)] : [],
    verdict: guess && guess === answer ? 'hit' : 'miss',
  }
}

/** Числовая клетка: точное совпадение или промах со стрелкой в сторону ответа. */
function numberCell(guess: number, answer: number, format = String): GameCell {
  if (!guess || !answer) return { values: guess ? [format(guess)] : [], verdict: 'miss' }
  if (guess === answer) return { values: [format(guess)], verdict: 'hit' }

  return { values: [format(guess)], verdict: 'miss', hint: answer > guess ? 'up' : 'down' }
}

// Упоминаний бывает и девять, и шестьдесят тысяч — читается только с разрядами.
const thousands = (n: number) => n.toLocaleString('ru-RU')

/**
 * Колонки, которые вообще уйдут в ответ. Спойлерные вырезаются на сервере, а не
 * прячутся на странице: иначе «Мёртв» приехал бы в браузер и лежал в отладчике.
 */
export function visibleColumns(maxVolume: number): GameColumnKey[] {
  const keys = GAME_COLUMNS.map(c => c.key)
  return maxVolume >= GAME_LAST_VOLUME ? keys : keys.filter(k => !GAME_SPOILER_COLUMNS.includes(k))
}

export async function buildGuessRow(
  guess: GameCharacter,
  answer: GameCharacter,
  maxVolume: number,
): Promise<GameGuessRow> {
  const glossary = await useGlossary()
  const ru = (v: string) => ruTerm(v, glossary)

  const all = {
    gender: () => singleCell(guess.gender, answer.gender, ru),
    species: () => multiCell(guess.species, answer.species, ru),
    status: () => singleCell(guess.status, answer.status, ru),
    affiliation: () => multiCell(guess.affiliation, answer.affiliation, ru),
    continent: () => multiCell(guess.continent, answer.continent, ru),
    occupation: () => multiCell(guess.occupation, answer.occupation, ru),
    cls: () => multiCell(guess.cls, answer.cls, ru),
    volume: () => numberCell(guess.volume, answer.volume),
    mentions: () => numberCell(guess.mentions, answer.mentions, thousands),
  } satisfies Record<GameColumnKey, () => GameCell>

  const cells: GameGuessRow['cells'] = {}
  for (const key of visibleColumns(maxVolume)) cells[key] = all[key]()

  return {
    id: guess.id,
    name: ruName(guess, glossary),
    image: guess.image,
    correct: guess.id === answer.id,
    cells,
  }
}

/**
 * Карточка разгаданного персонажа — показывается только после победы или сдачи.
 * Спойлерные колонки вырезаны и здесь: узнать имя — не то же самое, что узнать,
 * что персонаж погибнет через четыре тома.
 */
export async function buildAnswerCard(answer: GameCharacter, maxVolume: number) {
  const glossary = await useGlossary()

  return {
    id: answer.id,
    name: ruName(answer, glossary),
    original: answer.name,
    image: answer.image,
    row: await buildGuessRow(answer, answer, maxVolume),
  }
}
