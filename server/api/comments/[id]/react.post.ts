import { useDb } from '../../../utils/db'
import { commentReactions } from '../../../database/schema'
import { eq, and, isNull } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const commentId = Number(getRouterParam(event, 'id'))
  const { type } = await readBody<{ type: 'like' | 'dislike' }>(event)

  if (type !== 'like' && type !== 'dislike') {
    throw createError({ statusCode: 400, message: 'type must be like or dislike' })
  }

  const db = useDb()
  const session = await getUserSession(event)
  const userId = (session.user as any)?.id ?? null
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'

  const existing = userId
    ? await db.select().from(commentReactions)
        .where(and(eq(commentReactions.commentId, commentId), eq(commentReactions.userId, userId)))
    : await db.select().from(commentReactions)
        .where(and(eq(commentReactions.commentId, commentId), eq(commentReactions.ip, ip), isNull(commentReactions.userId)))

  if (existing.length > 0) {
    if (existing[0].type === type) {
      // Снять реакцию
      await db.delete(commentReactions).where(eq(commentReactions.id, existing[0].id))
      return { action: 'removed', type }
    } else {
      // Переключить тип
      await db.update(commentReactions)
        .set({ type })
        .where(eq(commentReactions.id, existing[0].id))
      return { action: 'switched', type }
    }
  }

  await db.insert(commentReactions).values({ commentId, type, userId, ip: userId ? null : ip })
  return { action: 'added', type }
})
