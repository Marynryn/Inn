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
  reel: { id: number; title: string; symbols: ReelSymbol[] } | null
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
