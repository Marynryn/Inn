/**
 * Общий словарь колонок игры «Кто из таверны»: сервер строит по нему разбор
 * попытки, страница — таблицу. Держим в одном месте, чтобы подписи и порядок
 * не разъезжались.
 */

export type GameVerdict = 'hit' | 'partial' | 'miss'

export type GameCell = {
  values: string[]
  verdict: GameVerdict
  /** Только для тома: куда двигаться от догадки к ответу. */
  hint?: 'up' | 'down'
}

export type GameColumnKey =
  | 'gender'
  | 'species'
  | 'status'
  | 'affiliation'
  | 'continent'
  | 'occupation'
  | 'cls'
  | 'volume'

export type GameGuessRow = {
  id: string
  name: string
  image: string
  correct: boolean
  cells: Record<GameColumnKey, GameCell>
}

export type GameStatus = 'playing' | 'won' | 'revealed'

export type GameMode = 'daily' | 'endless'

export const GAME_COLUMNS: { key: GameColumnKey; label: string }[] = [
  { key: 'gender', label: 'Пол' },
  { key: 'species', label: 'Вид' },
  { key: 'status', label: 'Статус' },
  { key: 'affiliation', label: 'Принадлежность' },
  { key: 'continent', label: 'Континент' },
  { key: 'occupation', label: 'Занятие' },
  { key: 'cls', label: 'Класс' },
  { key: 'volume', label: 'Том' },
]
