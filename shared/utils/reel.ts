import type { AvatarFrame } from './avatarFrames'
import type { NameFigure } from './nameFigures'

/**
 * Барабан — розыгрыш призов на ивенте. В окошке крутятся символы сегментов, и
 * тот, что остановился на линии, выпал. Сегмент с рамкой или фигуркой у имени —
 * приз, без них — сценка из таверны.
 */

/** Символ на ленте. Шансов и тиража здесь нет: читателю их знать незачем. */
export type ReelSymbol = {
  id: number
  label: string
  url: string
  /** Приз или сценка: «почти» на ленте — это приз на соседней клетке. */
  isPrize: boolean
}

export type SpinOutcome = 'won' | 'duplicate' | 'scene'

export type SpinResult = {
  segmentId: number
  outcome: SpinOutcome
  label: string
  /** Текст сценки. У приза пусто — о нём всё скажет само окно. */
  text: string | null
  imageUrl: string
  frame: AvatarFrame | null
  figure: NameFigure | null
}

export type ReelState = {
  reel: { id: number; title: string; symbols: ReelSymbol[]; texts: ReelTexts } | null
  /** Сегодняшняя попытка, если уже была. */
  today: SpinResult | null
  canSpin: boolean
}

/** Сегмент в панели — со всем, что читателю не показывают. */
export type AdminReelSegment = {
  id: number
  label: string
  frameId: number | null
  figure: string | null
  image: string | null
  imageUrl: string | null
  text: string | null
  weight: number
  stock: number | null
  /** Сколько раз выпал, сколько раз приз выдан и сколько было повторок. */
  landed: number
  won: number
  duplicates: number
}

export type AdminReel = {
  id: number
  title: string
  /** Проба: видят и крутят только админы. */
  adminsOnly: boolean
  /** Только изменённые тексты окна; чего нет — то по умолчанию. */
  texts: Partial<ReelTexts>
  status: 'draft' | 'running' | 'finished'
  startedAt: string | null
  finishedAt: string | null
  segments: AdminReelSegment[]
  spins: number
  players: number
}

/** Что панель присылает при сохранении сегментов. */
export type ReelSegmentInput = {
  label: string
  frameId: number | null
  figure: string | null
  image: string | null
  text: string | null
  weight: number
  stock: number | null
}

/** Шансы хранятся в десятых долях процента: 2,5% — это 25. Сумма — ровно 1000. */
export const REEL_WEIGHT_TOTAL = 1000

export const REEL_LABEL_MAX = 24
export const REEL_TEXT_MAX = 200
export const REEL_TITLE_MAX = 40

/** Картинка сценки — как рамка: символ крупный, мелкие детали должны читаться. */
export const REEL_IMAGE_MAX_BYTES = 600 * 1024
export const REEL_IMAGE_MAX_SIDE = 1024

export const percentToWeight = (pct: number) => Math.round(pct * 10)
export const weightToPercent = (weight: number) => weight / 10

/**
 * Тексты окна барабана и приглашения в колокольчике. Свои у каждого барабана —
 * хеллоуинскому ивенту хеллоуинские слова. В базе лежат только изменённые:
 * пустое поле в панели значит «как по умолчанию».
 */
export const REEL_TEXTS = {
  invite: { label: 'Приглашение в колокольчике', value: 'Попытка на сегодня ждёт тебя.' },
  lead: { label: 'Подпись над лентой', value: 'Одна попытка в день. Что остановится на линии, то и твоё.' },
  spinButton: { label: 'Кнопка запуска', value: 'Крутить' },
  wonFrame: { label: 'Выпала рамка — надпись над ней', value: 'Тебе досталась рамка' },
  wonFrameSub: { label: 'Выпала рамка — строка под ней', value: 'Она уже в твоём профиле. Примерь её прямо сейчас.' },
  wonFigure: { label: 'Выпала фигурка — надпись над ней', value: 'Тебе досталась фигурка' },
  wonFigureSub: { label: 'Выпала фигурка — строка под ней', value: 'Она уже в твоём профиле. Надень — и встанет рядом с твоим именем.' },
  duplicate: { label: 'Повторка — надпись над призом', value: 'Повторка' },
  duplicateFrameSub: { label: 'Повторка рамки — строка под ней', value: 'Эта рамка у тебя уже есть. Может, завтра повезёт на другую.' },
  duplicateFigureSub: { label: 'Повторка фигурки — строка под ней', value: 'Эта фигурка у тебя уже есть. Может, завтра повезёт на другую.' },
  scene: { label: 'Сценка — надпись над картинкой', value: 'Сегодня без приза' },
  wearButton: { label: 'Кнопка «Надеть»', value: 'Надеть' },
  footer: { label: 'Приписка внизу', value: 'Следующая попытка — завтра, пока идёт ивент.' },
} as const

export type ReelTextKey = keyof typeof REEL_TEXTS
export type ReelTexts = Record<ReelTextKey, string>

export const REEL_TEXT_KEYS = Object.keys(REEL_TEXTS) as ReelTextKey[]

/** Изменённые тексты из того, что пришло: незнакомые ключи, пустые строки и
 *  совпадающие с текстом по умолчанию выкидываем. */
export function cleanReelTexts(raw: unknown): Partial<ReelTexts> {
  const src = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const out: Partial<ReelTexts> = {}
  for (const key of REEL_TEXT_KEYS) {
    const v = typeof src[key] === 'string' ? (src[key] as string).replace(/\s+/g, ' ').trim().slice(0, REEL_TEXT_MAX) : ''
    if (v && v !== REEL_TEXTS[key].value) out[key] = v
  }
  return out
}

/** Тексты целиком: изменённые поверх тех, что по умолчанию. */
export function fullReelTexts(changed: Partial<ReelTexts> | null | undefined): ReelTexts {
  const out = {} as ReelTexts
  for (const key of REEL_TEXT_KEYS) out[key] = changed?.[key] || REEL_TEXTS[key].value
  return out
}
