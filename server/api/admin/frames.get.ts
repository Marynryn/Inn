import { desc, eq } from 'drizzle-orm'
import { userFrames, users } from '../../database/schema'
import { useDb } from '../../utils/db'
import { listFrames } from '../../utils/frames'
import { readerName } from '../../utils/identity'

/**
 * Каталог рамок и те, у кого они есть. Список владельцев тут полный, а не
 * страницей: рамки — штучная награда, и если их владельцев станет больше
 * экрана, это будет хорошая новость, а не повод для листалки.
 */
export default defineEventHandler(async () => {
  const db = useDb()
  const frames = await listFrames()

  const rows = await db
    .select({
      userId: userFrames.userId,
      frameId: userFrames.frameId,
      grantedAt: userFrames.grantedAt,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      avatarFrameId: users.avatarFrameId,
    })
    .from(userFrames)
    .innerJoin(users, eq(users.id, userFrames.userId))
    .orderBy(desc(userFrames.grantedAt))

  type Owner = {
    id: number
    name: string
    avatarUrl: string | null
    wearing: number | null
    frames: { id: number; grantedAt: string }[]
  }

  const owners = new Map<number, Owner>()
  for (const r of rows) {
    let owner = owners.get(r.userId)
    if (!owner) {
      owner = {
        id: r.userId,
        name: readerName(r),
        avatarUrl: r.avatarUrl,
        wearing: r.avatarFrameId,
        frames: [],
      }
      owners.set(r.userId, owner)
    }
    owner.frames.push({ id: r.frameId, grantedAt: r.grantedAt })
  }

  return {
    frames: frames.map(f => ({
      ...f,
      owners: rows.filter(r => r.frameId === f.id).length,
    })),
    owners: [...owners.values()],
  }
})
