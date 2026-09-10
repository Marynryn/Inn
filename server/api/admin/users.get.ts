import { like, or, sql } from 'drizzle-orm'
import { displayNameKey } from '#shared/utils/displayName'
import { users } from '../../database/schema'
import { useDb } from '../../utils/db'
import { readerName } from '../../utils/identity'

const LIMIT = 20

/**
 * Поиск читателя по имени или почте — чтобы было кому выдать рамку. Отдаём
 * горсткой: это подсказка к полю ввода, а не список пользователей сайта.
 *
 * По имени ищем в display_name_key, а не в самом имени: lower() у SQLite знает
 * только латиницу, и «марина» не нашла бы «Марину». Ключ же приводится к
 * одному написанию в javascript, кириллицу включая. У кого ключа нет, того
 * найдут по почте — она латиницей и так.
 */
export default defineEventHandler(async (event) => {
  const q = String(getQuery(event).q ?? '').trim()
  if (q.length < 2) return []

  const rows = await useDb()
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(or(
      like(users.displayNameKey, `%${displayNameKey(q)}%`),
      like(sql`lower(${users.email})`, `%${q.toLowerCase()}%`),
    ))
    .limit(LIMIT)

  return rows.map(r => ({ id: r.id, name: readerName(r), email: r.email, avatarUrl: r.avatarUrl }))
})
