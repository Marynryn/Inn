import type { AvatarFrame } from './avatarFrames'
import type { NameFigure } from './nameFigures'
import type { ProfileSkin } from './profileSkins'

/**
 * Барабан — розыгрыш призов на ивенте. В окошке крутятся символы сегментов, и
 * тот, что остановился на линии, выпал. Сегмент с рамкой, фигуркой у имени или
 * скином страницы — приз, без них — сценка из таверны.
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
  skin: ProfileSkin | null
  /** Сколько попыток осталось сегодня после этой; null — без ограничений (админ). */
  left?: number | null
}

/** Фон окна барабана: картинка, насколько её притушить и размыть под линией. */
export type ReelLook = {
  /** Адрес картинки; null — окно без фона, тёмное. */
  background: string | null
  /** Затемнение поверх картинки, в процентах. */
  dim: number
  /** Размытие фона под выпадающей клеткой, в пикселях. */
  blur: number
}

export type ReelState = {
  reel: { id: number; title: string; symbols: ReelSymbol[]; texts: ReelTexts; look: ReelLook } | null
  /** Последняя сегодняшняя попытка, если уже была. */
  today: SpinResult | null
  canSpin: boolean
  /** Сколько попыток осталось сегодня; null — без ограничений (админ). */
  left: number | null
  perDay: number
}

/** Сегмент в панели — со всем, что читателю не показывают. */
export type AdminReelSegment = {
  id: number
  label: string
  frameId: number | null
  figure: string | null
  skinId: number | null
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
  /** Сколько раз в день крутит читатель. */
  spinsPerDay: number
  /** Только изменённые тексты окна; чего нет — то по умолчанию. */
  texts: Partial<ReelTexts>
  /** Файл фона окна (для сохранения) и как фон показан. */
  background: string | null
  look: ReelLook
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
  skinId: number | null
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

/** Попыток в день у читателя: от одной до полусотни. */
export const REEL_SPINS_MAX = 50
export const clampSpinsPerDay = (v: unknown) => Math.min(REEL_SPINS_MAX, Math.max(1, Math.round(Number(v)) || 1))

/** Картинка сценки — как рамка: символ крупный, мелкие детали должны читаться. */
export const REEL_IMAGE_MAX_BYTES = 600 * 1024
export const REEL_IMAGE_MAX_SIDE = 1024

/** Фон окна — картинка во всё окно: крупнее и тяжелее символа ленты. */
export const REEL_BG_MAX_BYTES = 1536 * 1024
export const REEL_BG_MAX_SIDE = 2400

/** Затемнение фона: 0–90 %; размытие под линией: 0–20 px. */
export const REEL_DIM_MAX = 90
export const REEL_BLUR_MAX = 20
export const REEL_DIM_DEFAULT = 35
export const REEL_BLUR_DEFAULT = 6
const clampInt = (v: unknown, max: number, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : fallback
}
export const clampReelDim = (v: unknown) => clampInt(v, REEL_DIM_MAX, REEL_DIM_DEFAULT)
export const clampReelBlur = (v: unknown) => clampInt(v, REEL_BLUR_MAX, REEL_BLUR_DEFAULT)

export const percentToWeight = (pct: number) => Math.round(pct * 10)
export const weightToPercent = (weight: number) => weight / 10

/**
 * Тексты окна барабана и приглашения в колокольчике. Свои у каждого барабана —
 * хеллоуинскому ивенту хеллоуинские слова. В базе лежат только изменённые:
 * пустое поле в панели значит «как по умолчанию».
 */
export const REEL_TEXTS = {
  invite: { label: 'Приглашение в колокольчике', value: 'Попытка на сегодня ждёт тебя.' },
  lead: { label: 'Подпись над лентой', value: 'Что остановится на линии, то и твоё.' },
  spinButton: { label: 'Кнопка запуска', value: 'Крутить' },
  wonFrame: { label: 'Выпала рамка — надпись над ней', value: 'Тебе досталась рамка' },
  wonFrameSub: { label: 'Выпала рамка — строка под ней', value: 'Она уже в твоём профиле. Примерь её прямо сейчас.' },
  wonFigure: { label: 'Выпала фигурка — надпись над ней', value: 'Тебе досталась фигурка' },
  wonFigureSub: { label: 'Выпала фигурка — строка под ней', value: 'Она уже в твоём профиле. Надень — и встанет рядом с твоим именем.' },
  duplicate: { label: 'Повторка — надпись над призом', value: 'Повторка' },
  duplicateFrameSub: { label: 'Повторка рамки — строка под ней', value: 'Эта рамка у тебя уже есть. Может, завтра повезёт на другую.' },
  duplicateFigureSub: { label: 'Повторка фигурки — строка под ней', value: 'Эта фигурка у тебя уже есть. Может, завтра повезёт на другую.' },
  scene: { label: 'Сценка — надпись над картинкой', value: 'В этот раз без приза' },
  wonSkin: { label: 'Выпал скин — надпись над ним', value: 'Тебе достался скин' },
  wonSkinSub: { label: 'Выпал скин — строка под ним', value: 'Он уже в твоём профиле. Надень — и твоя страница оденется в него.' },
  duplicateSkinSub: { label: 'Повторка скина — строка под ним', value: 'Этот скин у тебя уже есть. Может, завтра повезёт на другой.' },
  wearButton: { label: 'Кнопка «Надеть»', value: 'Надеть' },
  againButton: { label: 'Кнопка «ещё раз»', value: 'Крутить ещё' },
  footer: { label: 'Приписка внизу, когда попытки кончились', value: 'Следующие попытки — завтра, пока идёт ивент.' },
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
