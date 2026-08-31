import type { GameCell, GameGuessRow } from '#shared/utils/gameColumns'
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

function volumeCell(guess: number, answer: number): GameCell {
  if (!guess || !answer) return { values: guess ? [String(guess)] : [], verdict: 'miss' }
  if (guess === answer) return { values: [String(guess)], verdict: 'hit' }

  return { values: [String(guess)], verdict: 'miss', hint: answer > guess ? 'up' : 'down' }
}

export async function buildGuessRow(guess: GameCharacter, answer: GameCharacter): Promise<GameGuessRow> {
  const glossary = await useGlossary()
  const ru = (v: string) => ruTerm(v, glossary)

  return {
    id: guess.id,
    name: ruName(guess, glossary),
    image: guess.image,
    correct: guess.id === answer.id,
    cells: {
      gender: singleCell(guess.gender, answer.gender, ru),
      species: multiCell(guess.species, answer.species, ru),
      status: singleCell(guess.status, answer.status, ru),
      affiliation: multiCell(guess.affiliation, answer.affiliation, ru),
      continent: multiCell(guess.continent, answer.continent, ru),
      occupation: multiCell(guess.occupation, answer.occupation, ru),
      cls: multiCell(guess.cls, answer.cls, ru),
      volume: volumeCell(guess.volume, answer.volume),
    },
  }
}

/** Карточка разгаданного персонажа — показывается только после победы или сдачи. */
export async function buildAnswerCard(answer: GameCharacter) {
  const glossary = await useGlossary()

  return {
    id: answer.id,
    name: ruName(answer, glossary),
    original: answer.name,
    image: answer.image,
    row: await buildGuessRow(answer, answer),
  }
}
