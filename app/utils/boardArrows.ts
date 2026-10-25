import type { BoardCell } from '#shared/utils/board'

/**
 * Стрелки прыжков на схеме карты — прямые отрезки от клетки к клетке. Мимо
 * чужих кружков они идут потому, что так расставлены сами клетки (LAYOUT в
 * shared/utils/board.ts), а не потому, что стрелка их огибает.
 *
 * Координаты — в единицах SVG карты (160×110), там же, где рисуется дорожка.
 */

export type BoardArrow = {
  from: number
  to: number
  forward: boolean
  /** Начало и конец — уже с отступом от центров клеток, до края кружка.
   *  По ним же тянется градиент: бледный хвост, яркий наконечник. */
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Насколько стрелка не доходит до центров своих клеток — до края кружка. */
const GAP = 5.5

export function boardArrows(
  cells: BoardCell[],
  jumpTarget: (i: number) => number | null,
  sx: number,
  sy: number,
): BoardArrow[] {
  return cells.flatMap((c, i) => {
    const to = jumpTarget(i)
    if (to === null) return []
    const t = cells[to]!
    const ax = c.x * sx, ay = c.y * sy, bx = t.x * sx, by = t.y * sy
    const len = Math.hypot(bx - ax, by - ay) || 1
    const ux = (bx - ax) / len, uy = (by - ay) / len
    return [{
      from: i,
      to,
      forward: to > i,
      x1: ax + ux * GAP,
      y1: ay + uy * GAP,
      x2: bx - ux * (GAP + 1),
      y2: by - uy * (GAP + 1),
    }]
  })
}
