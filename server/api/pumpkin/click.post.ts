import { useDb } from '../../utils/db'
import { pumpkinClickDays } from '../../database/schema'
import { sql } from 'drizzle-orm'

/**
 * Клик по хеллоуинской тыкве. Администраторов не считаем — сами мы кликаем
 * чаще всех, — ботов тоже. Каждый клик идёт в счёт: дедупликации нет, как и
 * у просмотров глав.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user?.role === 'admin' || isBotRequest(event)) return { ok: true, counted: false }

  await useDb()
    .insert(pumpkinClickDays)
    .values({ day: mskDay(), count: 1 })
    .onConflictDoUpdate({
      target: pumpkinClickDays.day,
      set: { count: sql`count + 1` },
    })

  return { ok: true, counted: true }
})
