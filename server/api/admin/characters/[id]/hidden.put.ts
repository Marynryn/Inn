import { setCharacterHidden } from '../../../../utils/character-hidden'
import { characterCards } from '../../../../utils/characters'

/** Спрятать карточку от читателей или вернуть. Доступ — admin-guard. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!(await characterCards()).some(c => c.id === id)) {
    throw createError({ statusCode: 404, message: 'Нет такого персонажа' })
  }
  const body = await readBody<{ hidden?: unknown }>(event)
  const hidden = body?.hidden === true
  await setCharacterHidden(id, hidden)
  return { id, hidden }
})
