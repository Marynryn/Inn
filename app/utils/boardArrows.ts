import type { BoardCell } from '#shared/utils/board'

/**
 * Стрелки прыжков поверх карты. Клетки стоят там, где на рисунке камни
 * дорожки, — раздвинуть их нельзя, и прямая стрелка шла бы поверх чужих
 * кружков. Поэтому для каждой подбирается плавный изгиб, который их обходит:
 * сперва ровная дуга от слабой к сильной, в обе стороны; не нашлась —
 * S-образная, с разным изгибом у начала и конца.
 *
 * Координаты — в единицах SVG карты: ширина 160, высота по пропорциям рисунка.
 */

type Pt = { x: number; y: number }

export type BoardArrow = {
  from: number
  to: number
  forward: boolean
  d: string
  /** Начало и конец — по ним тянется градиент: бледный хвост, яркий наконечник. */
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Сколько места держать вокруг центра чужой клетки — с запасом на телефон,
 *  где кружок относительно карты крупнее всего. */
const CLEAR = 7
/** Насколько стрелка не доходит до центров своих клеток — до края кружка. */
const GAP = 5.5

const bezier = (a: Pt, c1: Pt, c2: Pt, b: Pt, t: number): Pt => {
  const u = 1 - t
  return {
    x: u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x,
    y: u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y,
  }
}

/** Опорные точки сдвинуты вбок: у начала на h1, у конца на h2. */
function controls(a: Pt, b: Pt, h1: number, h2: number): [Pt, Pt] {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len, ny = dx / len
  return [
    { x: a.x + dx * 0.25 + nx * h1, y: a.y + dy * 0.25 + ny * h1 },
    { x: a.x + dx * 0.75 + nx * h2, y: a.y + dy * 0.75 + ny * h2 },
  ]
}

/** Насколько дуга залезает на чужие клетки и за край карты. 0 — чисто. */
function overlap(a: Pt, c1: Pt, c2: Pt, b: Pt, others: Pt[], w: number, h: number): number {
  let bad = 0
  for (let k = 0; k <= 48; k++) {
    const p = bezier(a, c1, c2, b, k / 48)
    if (p.x < 2 || p.x > w - 2 || p.y < 2 || p.y > h - 2) bad += 1
    // У самых концов стрелка и так возле своих клеток — там не проверяем.
    if (Math.hypot(p.x - a.x, p.y - a.y) < GAP || Math.hypot(p.x - b.x, p.y - b.y) < GAP) continue
    for (const o of others) {
      const d = Math.hypot(p.x - o.x, p.y - o.y)
      if (d < CLEAR) bad += CLEAR - d
    }
  }
  return bad
}

const BENDS = [0, ...Array.from({ length: 30 }, (_, i) => (i + 1) * 1.2).flatMap(h => [h, -h])]
const GRID = Array.from({ length: 21 }, (_, i) => (i - 10) * 3)

function bestBend(a: Pt, b: Pt, others: Pt[], w: number, h: number) {
  let best = { h1: 0, h2: 0, bad: Infinity }
  const consider = (h1: number, h2: number) => {
    const [c1, c2] = controls(a, b, h1, h2)
    const bad = overlap(a, c1, c2, b, others, w, h)
    if (bad < best.bad || (bad === best.bad && Math.abs(h1) + Math.abs(h2) < Math.abs(best.h1) + Math.abs(best.h2))) {
      best = { h1, h2, bad }
    }
  }
  for (const hh of BENDS) {
    consider(hh, hh)
    if (best.bad === 0) return best
  }
  for (const h1 of GRID) for (const h2 of GRID) consider(h1, h2)
  return best
}

/** Точка на расстоянии by от конца — по направлению к опорной точке. */
function inset(end: Pt, toward: Pt, by: number): Pt {
  const len = Math.hypot(toward.x - end.x, toward.y - end.y) || 1
  return { x: end.x + (toward.x - end.x) / len * by, y: end.y + (toward.y - end.y) / len * by }
}

/** Карта одна, и считать её стрелки на каждый запрос незачем. */
const cache = new WeakMap<BoardCell[], BoardArrow[]>()

export function boardArrows(
  cells: BoardCell[],
  jumpTarget: (i: number) => number | null,
  sx: number,
  sy: number,
): BoardArrow[] {
  const hit = cache.get(cells)
  if (hit) return hit

  const w = 100 * sx, h = 100 * sy
  const pts = cells.map(c => ({ x: c.x * sx, y: c.y * sy }))
  const arrows = cells.flatMap((_, i) => {
    const to = jumpTarget(i)
    if (to === null) return []
    const a = pts[i]!, b = pts[to]!
    // Дальше самого сильного изгиба от прямой не уйти — остальные клетки не проверяем.
    const reach = 40
    const others = pts.filter((p, k) => k !== i && k !== to
      && p.x >= Math.min(a.x, b.x) - reach && p.x <= Math.max(a.x, b.x) + reach
      && p.y >= Math.min(a.y, b.y) - reach && p.y <= Math.max(a.y, b.y) + reach)
    const best = bestBend(a, b, others, w, h)
    const [c1, c2] = controls(a, b, best.h1, best.h2)
    const start = inset(a, c1, GAP)
    const end = inset(b, c2, GAP + 1)
    const f = (n: number) => n.toFixed(2)
    return [{
      from: i,
      to,
      forward: to > i,
      d: `M${f(start.x)},${f(start.y)} C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(end.x)},${f(end.y)}`,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
    }]
  })
  cache.set(cells, arrows)
  return arrows
}

/** Для проверки: насколько каждая стрелка задевает чужие клетки (0 — чисто). */
export function arrowOverlaps(cells: BoardCell[], jumpTarget: (i: number) => number | null, sx: number, sy: number) {
  const w = 100 * sx, h = 100 * sy
  const pts = cells.map(c => ({ x: c.x * sx, y: c.y * sy }))
  return cells.flatMap((_, i) => {
    const to = jumpTarget(i)
    if (to === null) return []
    const others = pts.filter((_, k) => k !== i && k !== to)
    return [{ from: i + 1, to: to + 1, overlap: +bestBend(pts[i]!, pts[to]!, others, w, h).bad.toFixed(2) }]
  })
}
