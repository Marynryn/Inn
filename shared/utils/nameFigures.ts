/**
 * Фигурка у имени — живой значок справа от имени читателя в комментариях и на
 * его странице. Приз барабана. Каталог здесь, в коде, а не в базе: фигурки —
 * готовые анимации Fluent Emoji от Microsoft (MIT, лицензия рядом с ними в
 * public/figures), загружать свои незачем.
 *
 * У каждой четыре файла: анимация для имени, неподвижный первый кадр для тех,
 * кто просил систему уменьшить движение, крупная анимация для окна барабана и
 * крупный неподвижный кадр для его ленты — там едут десятки копий, и живые
 * перерисовывали бы всю ленту на каждом своём кадре.
 */

export const NAME_FIGURES = {
  ghost: 'Призрак',
  pumpkin: 'Тыква',
  bat: 'Летучая мышь',
  spider: 'Паук',
  skull: 'Череп',
} as const

export type NameFigureId = keyof typeof NAME_FIGURES

export type NameFigure = {
  id: NameFigureId
  name: string
  url: string
  still: string
  big: string
  bigStill: string
}

/** Фигурка в списке выбора. Не выдана — это примерка хозяйки сайта. */
export type OwnedFigure = NameFigure & { grantedAt: string | null; owned: boolean }

export const isFigureId = (v: unknown): v is NameFigureId =>
  typeof v === 'string' && Object.hasOwn(NAME_FIGURES, v)

export const toFigure = (id: NameFigureId): NameFigure => ({
  id,
  name: NAME_FIGURES[id],
  url: `/figures/${id}.webp`,
  still: `/figures/${id}-still.webp`,
  big: `/figures/${id}-big.webp`,
  bigStill: `/figures/${id}-big-still.webp`,
})

/** Фигурка по id из базы. Незнакомый id — например, убранной из каталога — значит «нет». */
export const figureById = (id: unknown): NameFigure | null => (isFigureId(id) ? toFigure(id) : null)

export const ALL_FIGURES: NameFigure[] = (Object.keys(NAME_FIGURES) as NameFigureId[]).map(toFigure)
