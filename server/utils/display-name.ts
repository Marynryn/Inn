import { and, eq, ne } from 'drizzle-orm'
import {
  DISPLAY_NAME_MAX,
  displayNameKey,
  isGenericName,
  isStaffName,
  normalizeDisplayName,
} from '#shared/utils/displayName'
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

/**
 * Можно ли гостю подписаться этим именем. Занятое читателем и служебное —
 * нельзя; безликие «Гость» и «Читатель» общие, их занимать некому.
 */
export async function isNameFreeForGuest(name: string): Promise<boolean> {
  const key = displayNameKey(name)
  if (!key || isGenericName(key)) return true
  if (isStaffName(key)) return false

  return !await nameOwnerId(key)
}

/**
 * Пропускает дальше только свободное имя. Безликие занимать нельзя вовсе, а
 * служебные — никому, кроме хозяйки сайта: под ними на сайте говорит она.
 */
export async function assertNameFree(name: string, owner?: { id: number, role: 'admin' | 'reader' }) {
  const key = displayNameKey(name)
  if (!key) return

  const busy = isGenericName(key)
    || (isStaffName(key) && owner?.role !== 'admin')
    || Boolean(await nameOwnerId(key, owner?.id))

  if (busy) throw createError({ statusCode: 409, message: 'Имя занято, выбери другое' })
}

/**
 * Свободный вариант имени: «Вася», «Вася 2», «Вася 3»… Нужен там, где отказать
 * нельзя — на входе через Google или телеграм, где имя приходит от провайдера, а
 * человек его в этот момент не выбирает. Безликое и служебное имя от провайдера
 * не берём вовсе: новичок останется без имени и назовётся сам.
 */
export async function freeDisplayName(base: string): Promise<string | null> {
  const name = normalizeDisplayName(base)
  if (!name || isGenericName(name) || isStaffName(name)) return null

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
