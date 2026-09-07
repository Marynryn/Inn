import { and, eq, ne } from 'drizzle-orm'
import { DISPLAY_NAME_MAX, displayNameKey, isReservedName, normalizeDisplayName } from '#shared/utils/displayName'
import { users } from '../database/schema'
import { useDb } from './db'

/**
 * Хранитель имён. В базе рядом с самим именем лежит его ключ — приведённое к
 * одному виду написание, по которому имена и сверяются; уникальный индекс на
 * этот столбец не даёт двум людям подписываться одинаково даже при
 * одновременной отправке.
 */

/** Кто уже подписывается этим именем. exceptUserId — сам владелец, он не помеха. */
export async function nameOwnerId(key: string, exceptUserId?: number): Promise<number | null> {
  if (!key) return null

  const db = useDb()
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(exceptUserId
      ? and(eq(users.displayNameKey, key), ne(users.id, exceptUserId))
      : eq(users.displayNameKey, key))

  return row?.id ?? null
}

/** Занято ли имя — для гостя, у которого своего аккаунта нет. */
export const isNameTaken = async (name: string) => Boolean(await nameOwnerId(displayNameKey(name)))

/**
 * Пропускает дальше только свободное имя. Безликие «Гость» и «Читатель»
 * занимать нельзя вовсе: под ними ходят все неназвавшиеся.
 */
export async function assertNameFree(name: string, exceptUserId?: number) {
  const key = displayNameKey(name)
  if (!key) return

  if (isReservedName(key) || await nameOwnerId(key, exceptUserId)) {
    throw createError({ statusCode: 409, message: 'Имя занято, выбери другое' })
  }
}

/**
 * Свободный вариант имени: «Вася», «Вася 2», «Вася 3»… Нужен там, где отказать
 * нельзя — на входе через Google или телеграм, где имя приходит от провайдера, а
 * человек его в этот момент не выбирает.
 */
export async function freeDisplayName(base: string): Promise<string | null> {
  const name = normalizeDisplayName(base)
  if (!name || isReservedName(name)) return null

  for (let n = 1; n <= 50; n++) {
    // Хвост может не влезть в сорок символов — тогда режем само имя, а не хвост.
    const suffix = n === 1 ? '' : ` ${n}`
    const variant = normalizeDisplayName(name.slice(0, DISPLAY_NAME_MAX - suffix.length) + suffix)
    if (!await nameOwnerId(displayNameKey(variant))) return variant
  }

  return null
}

/**
 * Тот же отказ, но от самой базы: между проверкой и записью имя мог занять
 * кто-то другой, и уникальный индекс ловит это последним. Пятисотка здесь сбила
 * бы с толку — человек должен увидеть всё то же «имя занято».
 */
export async function saveUnique<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (e: any) {
    if (String(e?.message ?? '').includes('display_name_key')) {
      throw createError({ statusCode: 409, message: 'Имя занято, выбери другое' })
    }
    throw e
  }
}
