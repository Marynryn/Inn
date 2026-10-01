import { grantFigure } from '../../../utils/figures'

/**
 * Выдать фигурку себе. Читателям фигурки достаются только с барабана, а
 * хозяйке сайта нужно примерить приз у своего имени до того, как его
 * разыграют, — поэтому выдача здесь только себе, не по номеру читателя.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ figure?: string }>(event)
  const session = await getUserSession(event)
  const userId = (session.user as { id?: number } | undefined)?.id
  if (!userId) throw createError({ statusCode: 401, message: 'Нужно войти' })

  await grantFigure(userId, String(body?.figure ?? ''))
  return { ok: true }
})
