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
 *  стрелки на карте было видно. Сцены к ним нарисованы на карте (public/board/map.webp). */
const TEXTS: [string, BoardEffect, BoardSkill?][] = [
  ['Эрин Солстис открывает дверь — и оказывается в чужом мире, у пустой таверны на холме.', none],
  ['В пещере — дракон. Эрин бежит без оглядки.', none],
  ['Синие плоды! Есть можно — только не косточки.', { kind: 'forward', n: 4 }],
  ['Гоблины кружат у таверны и ждут, когда можно будет стащить еду.', none],
  ['Рыба с огромными зубами в ручье. Рука болит, в голове — партия Морфи.', { kind: 'back', n: 3 }],
  ['В дверях гигантское насекомое: «Приветствую. Можем ли мы войти?»', none],
  ['Релк и Клбкч съели всё подчистую: «Запиши на наш счёт!»', { kind: 'skip' }],
  ['Вождь Гоблинов выбивает дверь таверны.', { kind: 'back', n: 7 }],
  ['Первый поход в Лискор. Гнолл выставляет Эрин из Гильдии авантюристов.', { kind: 'back', n: 4 }],
  ['Пишес снова ест бесплатно. Бонк — кастрюля летит точно в голову.', none, 'double'],
  ['Вождь Гоблинов повержен: кипящее масло — и Эрин жива.', none, 'brawl'],
  ['Чудовище из костей в дверях — Эрин швыряет кастрюлю. Это был Пишес.', none],
  ['Олесм садится за шахматы. Шах. Шах. Шах.', none],
  ['Новая вывеска — «Странствующая таверна». У двери табличка: «Не убивать Гоблинов».', { kind: 'forward', n: 5 }],
  ['Кислотные мухи в таверне. Это не может быть серьёзно.', { kind: 'back', n: 3 }, 'danger'],
  ['Рабочие Антиниума садятся за шахматную доску.', { kind: 'again' }],
  ['Рёка Гриффин бежит босиком, а за ней — Гоблины.', { kind: 'forward', n: 4 }],
  ['Кршиа точит нож на оселке и торгуется за каждую монету.', none],
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

/** Где клетки на карте, в процентах ширины и высоты рисунка, — на тропе у
 *  своих сцен (public/board/map.webp). Поменяется рисунок — координаты снимать
 *  заново. Сцены на рисунке идут не совсем по сюжету, тексты клеток
 *  расставлены под них. */
const LAYOUT: [number, number][] = [
  [7, 11.5], [24, 14.5], [34, 17.5], [45, 21], [58, 23], [74, 19.5], [85.5, 25],
  [57, 37.5], [39, 37], [25, 36], [10, 35], [3, 41],
  [27, 51], [40, 51.5], [51, 47.5], [69, 51], [86, 52], [96, 62],
  [80, 71.5], [64, 72.5], [50, 76.5], [35, 74], [21, 71], [4, 76],
  [10, 88], [24, 92], [41, 92.5], [58, 92.5], [73, 92], [89, 91],
]

/** Пропорции рисунка карты: ширина к высоте. По ним тянется и SVG стрелок. */
export const BOARD_MAP_RATIO = 1503 / 1046

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
  /** «Ещё бросок», заработанный в чужой ход: достанется после своего. */
  bonus: number
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
  /** Кто начинает следующую партию за этим столом — по кругу, после
   *  того, кто начинал эту. Есть только у оконченной партии. */
  nextHostSlot: number | null
  turnSlot: number | null
  winnerSlot: number | null
  players: BoardPlayer[]
  /** Где Скиннер; null — ещё не вышел из руин. */
  skinner: number | null
  /** Игрок, чей сейчас ход, уже сыграл навык. */
  skillUsed: boolean
  /** Выпало два кубика — игрок, чей ход, выбирает, на какой идти. */
  choice: number[] | null
  lastAction: BoardAction | null
  log: BoardLogEntry[]
}

/** Сообщения сервера странице. */
export type BoardServerMessage =
  | { type: 'joined'; you: number; state: BoardState; chat: BoardChatMessage[] }
  | { type: 'state'; state: BoardState }
  | { type: 'chat'; message: BoardChatMessage }
  /** Событие, о котором надо сказать всем за столом вслух: кто-то ушёл. */
  | { type: 'event'; text: string }
  /** fatal — в комнату не пустили, и сокет больше ничего не ждёт. */
  | { type: 'error'; message: string; fatal?: boolean }

/** Сообщения страницы серверу. */
export type BoardClientMessage =
  | { type: 'join'; ticket: string; code: string }
  | { type: 'start' }
  | { type: 'roll' }
  /** На какой из двух кубиков идти: 0 или 1. */
  | { type: 'choose'; index: number }
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
