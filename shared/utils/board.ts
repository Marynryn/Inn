/**
 * Настольная игра по карте: фишки идут по клеткам, кубик бросает сервер. Здесь
 * то, что нужно и серверу, и странице: клетки карты, их эффекты и то, как
 * выглядит комната для игрока.
 *
 * Карта пока временная — схема без картинки; тексты клеток идут по первому тому.
 * Настоящую карту нарисуем по сюжету, и тогда клетки поедут в админку.
 */

/** Что делает клетка, когда на неё встали. Эффект срабатывает один раз:
 *  клетка, куда отбросило, своего эффекта уже не даёт — иначе две клетки
 *  могли бы гонять фишку друг к другу без конца. */
export type BoardEffect =
  | { kind: 'none' }
  | { kind: 'forward'; n: number }
  | { kind: 'back'; n: number }
  | { kind: 'skip' }
  | { kind: 'again' }

/** Навыки — карточки, которые выдают сюжетные клетки. Названия — те самые
 *  Навыки Эрин из первого тома. */
export const BOARD_SKILLS = {
  double: { name: '[Безупречный бросок]', hint: 'Сыграй до броска: кубиков будет два, идёшь на больший.' },
  brawl: { name: '[Трактирная драка]', hint: 'Выбери соперника — он отступает на 2 клетки.' },
  danger: { name: '[Чутьё опасности]', hint: 'Сработает само: спасёт от красной стрелки, Скиннера или проигранной встречи.' },
} as const

export type BoardSkill = keyof typeof BOARD_SKILLS
export const isBoardSkill = (v: unknown): v is BoardSkill => typeof v === 'string' && Object.hasOwn(BOARD_SKILLS, v)

/** Сколько карточек навыков можно держать сразу. */
export const BOARD_HAND_MAX = 3

export type BoardCell = {
  /** Положение на карте — в процентах её ширины и высоты: картинка карты
   *  тянется под экран, и клетки должны ехать вместе с ней. */
  x: number
  y: number
  text: string
  effect: BoardEffect
  /** Навык, который клетка выдаёт тому, кто встал на неё по кубику. */
  skill?: BoardSkill
}

export const BOARD_MIN_PLAYERS = 1
export const BOARD_MAX_PLAYERS = 4
export const BOARD_CHAT_MAX = 300

/** Цвета фишек по местам за столом. */
export const BOARD_COLORS = ['#d6883e', '#8fb07a', '#7aa3d6', '#c88ad6'] as const

const none: BoardEffect = { kind: 'none' }

/** Путь по первому тому, от двери в таверну до возвращения Клбкча. Хорошее
 *  в сюжете перебрасывает вперёд, плохое — назад; прыжки длинные, чтобы
 *  стрелки на карте было видно. Карта пока схема, тексты — первый набросок. */
const TEXTS: [string, BoardEffect, BoardSkill?][] = [
  ['Эрин Солстис открывает дверь — и оказывается в чужом мире, у пустой таверны на холме.', none],
  ['В пещере — дракон. Эрин бежит без оглядки.', none],
  ['Синие плоды! Есть можно — только не косточки.', { kind: 'forward', n: 4 }],
  ['Гоблины кружат у таверны и ждут, когда можно будет стащить еду.', none],
  ['Рыба с огромными зубами в ручье. Рука болит, в голове — партия Морфи.', { kind: 'back', n: 3 }],
  ['В дверях гигантское насекомое: «Приветствую. Можем ли мы войти?»', none],
  ['Релк и Клбкч съели всё подчистую: «Запиши на наш счёт!»', { kind: 'skip' }],
  ['Чудовище из костей в дверях — Эрин швыряет кастрюлю. Это был Пишес.', none],
  ['Пишес снова ест бесплатно. Бонк — кастрюля летит точно в голову.', none, 'double'],
  ['Первый поход в Лискор. Гнолл выставляет Эрин из Гильдии авантюристов.', { kind: 'back', n: 4 }],
  ['Вождь Гоблинов выбивает дверь таверны.', { kind: 'back', n: 7 }],
  ['Вождь Гоблинов повержен: кипящее масло — и Эрин жива.', none, 'brawl'],
  ['Олесм садится за шахматы. Шах. Шах. Шах.', none],
  ['Новая вывеска — «Странствующая таверна». У двери табличка: «Не убивать Гоблинов».', { kind: 'forward', n: 5 }],
  ['Кршиа точит нож на оселке и торгуется за каждую монету.', none],
  ['Кислотные мухи в таверне. Это не может быть серьёзно.', { kind: 'back', n: 3 }, 'danger'],
  ['Рабочие Антиниума садятся за шахматную доску.', { kind: 'again' }],
  ['Рёка Гриффин бежит босиком, а за ней — Гоблины.', { kind: 'forward', n: 4 }],
  ['Рёка в гостях у Магнолии Рейнхарт.', none],
  ['Чёрный прилив. Клбкч падает в бою.', { kind: 'skip' }],
  ['Эрин плачет по Антиниумам — и садится играть в шахматы с Поуном.', none, 'double'],
  ['Гази смотрит сквозь холм, и каменный краб замирает под панцирем.', none, 'danger'],
  ['В Лискор приходит Ксмвр.', none],
  ['Пишес поднимает для таверны скелета. Потом его назовут Торен.', { kind: 'again' }],
  ['Ксмвр калечит Поуна.', { kind: 'back', n: 6 }],
  ['«Я личность. Я антиниум».', none],
  ['Засада в руинах: мёртвые хлынули из стен.', { kind: 'back', n: 5 }],
  ['Рога Хаммерада уходят в катакомбы. Что-то там проснулось.', { kind: 'back', n: 7 }],
  ['Эрин держит дверь таверны со сковородой в руках.', none],
  ['«Добрый вечер, Эрин Солстис. Могу я войти?» Финиш!', none],
]

/** Где клетки на схеме, в процентах ширины и высоты карты. Змейка по рядам,
 *  но не ровной сеткой: клетки подвинуты так, чтобы стрелка каждого прыжка
 *  шла коротким отрезком мимо чужих кружков. Расстановку подобрал перебор по
 *  этим самым прыжкам — поменяются прыжки, подбирать заново. */
const LAYOUT: [number, number][] = [
  [6.4, 13.2], [24.4, 8], [42.3, 14.2], [51.8, 22.6], [65.9, 8.2], [84.6, 9.9],
  [88.7, 25], [75.9, 31.6], [63.1, 34.5], [44.4, 37.2], [25.7, 35.3], [7.1, 34.6],
  [8.5, 50.9], [27.3, 58.2], [45, 53.4], [55, 44.3], [70.1, 48.3], [84.5, 52.5],
  [77.2, 66.4], [68, 77.3], [55.5, 79.1], [39.3, 68.1], [20.6, 69.8], [6, 65.1],
  [13.2, 82.9], [26.9, 88.2], [44.9, 88.2], [62.9, 92], [80.4, 88.3], [94, 87.8],
]

export const BOARD_CELLS: BoardCell[] = TEXTS.map(([text, effect, skill], i) => {
  const [x, y] = LAYOUT[i]!
  return { x, y, text, effect, ...(skill ? { skill } : {}) }
})

export const BOARD_LAST = BOARD_CELLS.length - 1

/**
 * Скиннер. По сюжету он выходит из руин и идёт на Лискор — здесь он
 * появляется у руин, когда кто-то из игроков забрался достаточно далеко, и
 * охотится: каждый круг бросает свой кубик и идёт на 1–3 клетки к ближайшему
 * игроку — вперёд или назад, может и проскочить. Ловит того, на чьей клетке
 * закончил ход или кто сам встал на его клетку, — всех подряд и сколько
 * угодно раз. С карты он не уходит до конца партии.
 */
export const SKINNER_START = 27
export const SKINNER_WAKES_AT = 10
export const SKINNER_STEP_MIN = 1
export const SKINNER_STEP_MAX = 3
export const SKINNER_THROW = 3

/** Встретились на одной клетке — проигравший во встрече отступает. */
export const DUEL_THROW = 2
export const BRAWL_THROW = 2

/** Куда перебрасывает клетка — или null, если она никуда не ведёт. Прыжок
 *  не выходит за старт и финиш. По нему же рисуются стрелки на карте. */
export function jumpTarget(i: number): number | null {
  const e = BOARD_CELLS[i]?.effect
  if (e?.kind === 'forward') return Math.min(i + e.n, BOARD_LAST)
  if (e?.kind === 'back') return Math.max(i - e.n, 0)
  return null
}

export function effectLabel(e: BoardEffect): string {
  switch (e.kind) {
    case 'forward': return `вперёд на ${e.n}`
    case 'back': return `назад на ${e.n}`
    case 'skip': return 'пропуск хода'
    case 'again': return 'ещё бросок'
    default: return ''
  }
}

export type BoardStatus = 'lobby' | 'playing' | 'finished'

export type BoardPlayer = {
  /** Место за столом — номер игрока в комнате. Номер читателя на сайте
   *  наружу не отдаём, см. /api/auth/me. */
  slot: number
  name: string
  avatarUrl: string | null
  color: string
  pos: number
  /** Сколько ходов ещё пропустить. */
  skip: number
  skills: BoardSkill[]
  /** Следующий бросок — двумя кубиками. */
  doubleNext: boolean
  online: boolean
  left: boolean
}

export type BoardChatMessage = { id: number; slot: number; name: string; text: string; at: number }

/** Шаги анимации одного действия — страница проигрывает их по порядку. */
export type BoardFx =
  | { kind: 'dice'; values: number[] }
  | { kind: 'walk'; slot: number; cells: number[] }
  /** По стрелке — одним прыжком. */
  | { kind: 'jump'; slot: number; to: number }
  /** Отбросило: Скиннер, встреча, драка. */
  | { kind: 'push'; slot: number; to: number }
  | { kind: 'skinner'; to: number }
  /** Встреча на клетке: оба бросили кубик, у кого меньше — отступает. */
  | { kind: 'duel'; a: number; b: number; va: number; vb: number }

/** Что случилось последним: бросок или сыгранный навык. */
export type BoardAction = {
  id: number
  slot: number
  /** Клетка, куда пришли по кубику, — её текст показывается у кубика. */
  landed: number | null
  fx: BoardFx[]
  /** Что ещё случилось, по строчке: получен навык, Скиннер, встреча. */
  notes: string[]
  auto: boolean
}

export type BoardLogEntry = { id: number; text: string }

export type BoardState = {
  code: string
  status: BoardStatus
  hostSlot: number
  turnSlot: number | null
  winnerSlot: number | null
  players: BoardPlayer[]
  /** Где Скиннер; null — ещё не вышел из руин. */
  skinner: number | null
  /** Игрок, чей сейчас ход, уже сыграл навык. */
  skillUsed: boolean
  lastAction: BoardAction | null
  log: BoardLogEntry[]
}

/** Сообщения сервера странице. */
export type BoardServerMessage =
  | { type: 'joined'; you: number; state: BoardState; chat: BoardChatMessage[] }
  | { type: 'state'; state: BoardState }
  | { type: 'chat'; message: BoardChatMessage }
  /** fatal — в комнату не пустили, и сокет больше ничего не ждёт. */
  | { type: 'error'; message: string; fatal?: boolean }

/** Сообщения страницы серверу. */
export type BoardClientMessage =
  | { type: 'join'; ticket: string; code: string }
  | { type: 'start' }
  | { type: 'roll' }
  | { type: 'skill'; skill: BoardSkill; target?: number }
  | { type: 'chat'; text: string }
  | { type: 'leave' }
  /** Ещё партия за тем же столом — после конца прошлой. */
  | { type: 'rematch' }

/** Код комнаты: без букв и цифр, которые легко спутать (0/O, 1/I). */
export const BOARD_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const BOARD_CODE_LENGTH = 5
export const isBoardCode = (v: unknown): v is string =>
  typeof v === 'string' && v.length === BOARD_CODE_LENGTH && [...v].every(c => BOARD_CODE_ALPHABET.includes(c))
