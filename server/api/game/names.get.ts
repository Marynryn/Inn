import { isPool, poolCharacters, ruName, useGlossary } from '../../utils/game-data'

/**
 * Список имён для подсказок ввода — единственное, что игра отдаёт наружу целиком.
 * Признаков здесь нет: по этому ответу нельзя ни собрать базу, ни вычислить
 * загаданного. Имя в двух видах, чтобы искать хоть по-русски, хоть латиницей.
 */
export default defineEventHandler(async (event) => {
  const { pool } = getQuery(event)
  const chosen = isPool(pool) ? pool : 'known'

  const glossary = await useGlossary()
  const list = await poolCharacters(chosen)

  return {
    pool: chosen,
    characters: list
      .map(c => ({ id: c.id, name: ruName(c, glossary), original: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  }
})
