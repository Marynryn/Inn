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
  | 'mentions'

export type GameGuessRow = {
  id: string
  name: string
  image: string
  correct: boolean
  /**
   * Не все признаки приходят всегда: при ограничении по тому сервер вырезает
   * спойлерные колонки из ответа целиком, а не прячет их на странице.
   */
  cells: Partial<Record<GameColumnKey, GameCell>>
}

export type GameStatus = 'playing' | 'won' | 'revealed'

export type GameMode = 'daily' | 'endless'

/** Последний вышедший том оригинала: на него смотрят данные вики. */
export const GAME_LAST_VOLUME = 10

export const GAME_VOLUMES = Array.from({ length: GAME_LAST_VOLUME }, (_, i) => i + 1)

/**
 * Признаки, которые в данных вики записаны «на сегодня» и потому выдают будущее.
 * Пока игрок ограничил себя томом, их не показываем: статус — это в первую
 * очередь смерть, а вики не хранит, в каком томе она случилась.
 */
export const GAME_SPOILER_COLUMNS: GameColumnKey[] = ['status']

export const GAME_COLUMNS: { key: GameColumnKey; label: string }[] = [
  { key: 'gender', label: 'Пол' },
  { key: 'species', label: 'Вид' },
  { key: 'status', label: 'Статус' },
  { key: 'affiliation', label: 'Принадлежность' },
  { key: 'continent', label: 'Континент' },
  { key: 'occupation', label: 'Занятие' },
  { key: 'cls', label: 'Класс' },
  { key: 'volume', label: 'Том' },
  { key: 'mentions', label: 'Упоминаний' },
]

/** Колонки-числа: значение со стрелкой, а не список значений. */
export const GAME_NUMBER_COLUMNS: GameColumnKey[] = ['volume', 'mentions']
