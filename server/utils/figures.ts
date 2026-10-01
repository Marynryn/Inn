import { and, eq } from 'drizzle-orm'
import type { NameFigureId, OwnedFigure } from '#shared/utils/nameFigures'
import { ALL_FIGURES, figureById, isFigureId } from '#shared/utils/nameFigures'
import { userFigures } from '../database/schema'
import { useDb } from './db'

export async function ownsFigure(userId: number, figure: NameFigureId): Promise<boolean> {
  const [row] = await useDb()
    .select({ figure: userFigures.figure })
    .from(userFigures)
    .where(and(eq(userFigures.userId, userId), eq(userFigures.figure, figure)))
  return Boolean(row)
}

/**
 * Из чего человек выбирает фигурку. Читатель — только из выданного. Хозяйке
 * сайта показываем весь каталог, но лишь для примерки: надеть может только
 * выданную себе, как рамку и скин.
 */
export async function wearableFigures(userId: number, isAdmin: boolean): Promise<OwnedFigure[]> {
  const rows = await useDb()
    .select({ figure: userFigures.figure, grantedAt: userFigures.grantedAt })
    .from(userFigures)
    .where(eq(userFigures.userId, userId))
    .orderBy(userFigures.grantedAt)

  // Фигурку, убранную из каталога, не показываем: нарисовать её уже нечем.
  const owned: OwnedFigure[] = rows.flatMap((r) => {
    const f = figureById(r.figure)
    return f ? [{ ...f, grantedAt: r.grantedAt, owned: true }] : []
  })
  if (!isAdmin) return owned

  const has = new Set(owned.map(f => f.id))
  return [...owned, ...ALL_FIGURES.filter(f => !has.has(f.id)).map(f => ({ ...f, grantedAt: null, owned: false }))]
}

/** Выдать фигурку. Повторная выдача — не ошибка: возвращает false. */
export async function grantFigure(userId: number, figure: string): Promise<boolean> {
  if (!isFigureId(figure)) throw createError({ statusCode: 404, message: 'Такой фигурки нет' })
  const added = await useDb().insert(userFigures).values({ userId, figure }).onConflictDoNothing().returning()
  return added.length > 0
}
