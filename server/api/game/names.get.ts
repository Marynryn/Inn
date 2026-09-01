import { clampVolume, isPool, poolCharacters, ruName, useGlossary } from '../../utils/game-data'
import { fullNameOf } from '../../utils/game-pack'

/**
 * Список имён для подсказок ввода — единственное, что игра отдаёт наружу целиком.
 * Признаков здесь нет: по этому ответу нельзя ни собрать базу, ни вычислить
 * загаданного. Имя в двух видах, чтобы искать хоть по-русски, хоть латиницей.
 *
 * Потолок тома действует и тут: персонажей из непрочитанных томов игрок не
 * увидит даже в подсказках.
 */
export default defineEventHandler(async (event) => {
  const { pool, maxVolume } = getQuery(event)
  const chosen = isPool(pool) ? pool : 'known'
  const cap = clampVolume(maxVolume)

  const glossary = await useGlossary()
  const list = await poolCharacters(chosen, cap)

  return {
    pool: chosen,
    maxVolume: cap,
    characters: list
      .map(c => ({ id: c.id, name: ruName(c, glossary), original: fullNameOf(c) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  }
})
