import { checkRateLimit } from '../../../utils/rate-limit'
import { toggleFlame } from '../../../utils/character-flames'
import { characterCards } from '../../../utils/characters'

/** Зажечь или погасить огонёк на карточке. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  if (!checkRateLimit(`flame:${ip}`, 30, 60_000)) {
    throw createError({ statusCode: 429, message: 'Слишком часто' })
  }

  if (!(await characterCards()).some(c => c.id === id)) {
    throw createError({ statusCode: 404, message: 'Нет такого персонажа' })
  }

  return toggleFlame(event, id)
})
