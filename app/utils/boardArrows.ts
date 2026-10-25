import type { BoardCell } from '#shared/utils/board'

/**
 * Стрелки прыжков на схеме карты. Прямая или одна и та же дуга шла поверх
 * чужих клеток, и было не понять, откуда стрелка и куда. Здесь для каждой
 * стрелки подбирается изгиб, при котором она обходит все остальные кружки:
 * от едва заметного к сильному, в обе стороны — берётся первый, что прошёл.
 *
 * Координаты — в единицах SVG карты (160×110), там же, где рисуется дорожка.
 */

type Pt = { x: number; y: number }

export type BoardArrow = { from: number; to: number; forward: boolean; d: string }

/** Сколько места держать вокруг центра чужой клетки. На телефоне кружок
 *  относительно карты крупнее всего — запас считаем по нему. */
const CLEAR = 7
/** Насколько стрелка не доходит до центров своих клеток — до края кружка. */
const GAP = 5.5
const W = 160
const H = 110

const bezier = (a: Pt, c1: Pt, c2: Pt, b: Pt, t: number): Pt => {
  const u = 1 - t
  return {
    x: u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x,
    y: u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y,
  }
}

/** Дуга-«горб»: опорные точки сдвинуты вбок — у начала на h1, у конца на h2.
 *  Равные сдвиги дают ровный горб между рядами; разные — S-образную дугу для
 *  стрелок, которым надо пройти наискось между клетками. */
function controls(a: Pt, b: Pt, h1: number, h2 = h1): [Pt, Pt] {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len, ny = dx / len
  return [
    { x: a.x + dx * 0.25 + nx * h1, y: a.y + dy * 0.25 + ny * h1 },
    { x: a.x + dx * 0.75 + nx * h2, y: a.y + dy * 0.75 + ny * h2 },
  ]
}

/** Подобрать изгиб: сначала ровные горбы от слабого к сильному, и только
 *  если ни один не прошёл — сетку разных сдвигов у начала и конца. */
function bestBend(a: Pt, b: Pt, others: Pt[]): { h1: number; h2: number; bad: number } {
  let best = { h1: 0, h2: 0, bad: Infinity }
  const consider = (h1: number, h2: number) => {
    const [c1, c2] = controls(a, b, h1, h2)
    const bad = overlap(a, c1, c2, b, others)
    // При равной чистоте берём изгиб помягче.
    if (bad < best.bad || (bad === best.bad && Math.abs(h1) + Math.abs(h2) < Math.abs(best.h1) + Math.abs(best.h2))) {
      best = { h1, h2, bad }
    }
  }
  for (const h of BENDS) {
    consider(h, h)
    if (best.bad === 0) return best
  }
  for (const h1 of GRID) for (const h2 of GRID) consider(h1, h2)
  return best
}

/** Насколько дуга залезает на чужие клетки и за край карты. 0 — чисто. */
function overlap(a: Pt, c1: Pt, c2: Pt, b: Pt, others: Pt[]): number {
  let bad = 0
  for (let k = 0; k <= 60; k++) {
    const p = bezier(a, c1, c2, b, k / 60)
    if (p.x < 2 || p.x > W - 2 || p.y < 2 || p.y > H - 2) bad += 1
    // У самых концов стрелка и так возле своих клеток — там не проверяем.
    if (Math.hypot(p.x - a.x, p.y - a.y) < GAP || Math.hypot(p.x - b.x, p.y - b.y) < GAP) continue
    for (const o of others) {
      const d = Math.hypot(p.x - o.x, p.y - o.y)
      if (d < CLEAR) bad += CLEAR - d
    }
  }
  return bad
}

/** Чужие клетки, которые вообще могут оказаться на пути: дальше самого
 *  сильного изгиба от прямой стрелки не уйти, остальные можно не проверять. */
function nearby(pts: Pt[], a: Pt, b: Pt, i: number, to: number): Pt[] {
  const reach = 40
  const x0 = Math.min(a.x, b.x) - reach, x1 = Math.max(a.x, b.x) + reach
  const y0 = Math.min(a.y, b.y) - reach, y1 = Math.max(a.y, b.y) + reach
  return pts.filter((p, k) => k !== i && k !== to && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)
}

/** Точка на расстоянии by от конца — по направлению к опорной точке. */
function inset(end: Pt, toward: Pt, by: number): Pt {
  const len = Math.hypot(toward.x - end.x, toward.y - end.y) || 1
  return { x: end.x + (toward.x - end.x) / len * by, y: end.y + (toward.y - end.y) / len * by }
}

/** Тонкая волна вдоль дуги; к концам волна гаснет, чтобы наконечник
 *  смотрел точно в клетку. */
function wavy(a: Pt, c1: Pt, c2: Pt, b: Pt): string {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const waves = Math.max(2, Math.round(len / 9))
  const n = waves * 8
  const amp = 1.4
  const pts: string[] = []
  for (let k = 0; k <= n; k++) {
    const t = k / n
    const p = bezier(a, c1, c2, b, t)
    const q = bezier(a, c1, c2, b, Math.min(1, t + 0.01))
    const r = bezier(a, c1, c2, b, Math.max(0, t - 0.01))
    const tx = q.x - r.x, ty = q.y - r.y
    const tl = Math.hypot(tx, ty) || 1
    const off = Math.sin(t * waves * 2 * Math.PI) * amp * Math.sin(Math.PI * t)
    pts.push(`${(p.x - ty / tl * off).toFixed(2)},${(p.y + tx / tl * off).toFixed(2)}`)
  }
  return `M${pts.join(' L')}`
}

/** Горбы на выбор: от прямой к сильному изгибу, по очереди в обе стороны. */
const BENDS = [0, ...Array.from({ length: 40 }, (_, i) => (i + 1) * 0.9).flatMap(h => [h, -h])]
const GRID = Array.from({ length: 25 }, (_, i) => (i - 12) * 2.5)

/** Карта одна на всех, и считать её стрелки на каждый запрос незачем:
 *  сервер запоминает их для этого набора клеток. */
const cache = new WeakMap<BoardCell[], BoardArrow[]>()

export function boardArrows(
  cells: BoardCell[],
  jumpTarget: (i: number) => number | null,
  sx: number,
  sy: number,
): BoardArrow[] {
  const hit = cache.get(cells)
  if (hit) return hit
  const arrows = computeArrows(cells, jumpTarget, sx, sy)
  cache.set(cells, arrows)
  return arrows
}

function computeArrows(
  cells: BoardCell[],
  jumpTarget: (i: number) => number | null,
  sx: number,
  sy: number,
): BoardArrow[] {
  const pts = cells.map(c => ({ x: c.x * sx, y: c.y * sy }))

  return cells.flatMap((_, i) => {
    const to = jumpTarget(i)
    if (to === null) return []
    const a = pts[i]!, b = pts[to]!
    const others = nearby(pts, a, b, i, to)

    const best = bestBend(a, b, others)
    const [c1, c2] = controls(a, b, best.h1, best.h2)
    const start = inset(a, c1, GAP)
    const end = inset(b, c2, GAP + 1)
    return [{ from: i, to, forward: to > i, d: wavy(start, c1, c2, end) }]
  })
}

/** Для проверки: сколько чужих клеток задевает каждая стрелка. */
export function arrowOverlaps(cells: BoardCell[], jumpTarget: (i: number) => number | null, sx: number, sy: number) {
  const pts = cells.map(c => ({ x: c.x * sx, y: c.y * sy }))
  return cells.flatMap((_, i) => {
    const to = jumpTarget(i)
    if (to === null) return []
    const a = pts[i]!, b = pts[to]!
    const others = nearby(pts, a, b, i, to)
    const best = bestBend(a, b, others).bad
    return [{ from: i + 1, to: to + 1, overlap: Number(best.toFixed(2)) }]
  })
}
