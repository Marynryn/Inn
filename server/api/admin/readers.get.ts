import { desc } from 'drizzle-orm'
import { userIdentities, users } from '../../database/schema'
import { useDb } from '../../utils/db'
import { framesByIds } from '../../utils/frames'
import { readerName } from '../../utils/identity'

/**
 * Все, у кого есть аккаунт, — новые сверху. Админке нужен список, чтобы
 * ходить по профилям читателей; читателей пока единицы, поэтому без поиска и
 * подгрузки, одним запросом.
 */
export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      role: users.role,
      avatarUrl: users.avatarUrl,
      avatarFrameId: users.avatarFrameId,
      publicId: users.publicId,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt), desc(users.id))

  // Как входит: Google и телеграм — по привязанным входам; ни того ни другого —
  // аккаунт с паролем, заведённый вручную.
  const ids = await db.select({ userId: userIdentities.userId, provider: userIdentities.provider }).from(userIdentities)
  const providers = new Map<number, string[]>()
  for (const r of ids) providers.set(r.userId, [...(providers.get(r.userId) ?? []), r.provider])

  const frames = await framesByIds(rows.map(r => r.avatarFrameId))

  return rows.map(r => ({
    id: r.id,
    name: readerName(r),
    code: r.publicId,
    isAdmin: r.role === 'admin',
    avatarUrl: r.avatarUrl,
    avatarFrame: r.avatarFrameId ? frames.get(r.avatarFrameId) ?? null : null,
    providers: providers.get(r.id) ?? [],
    createdAt: r.createdAt,
  }))
})
