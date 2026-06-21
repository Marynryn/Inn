import { useDb } from '../../utils/db'
import { comments, users, commentReactions } from '../../database/schema'
import { eq, isNull, desc, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const db = useDb()

  const isSiteWide = query.siteWide === '1' || query.site === 'true'

  if (!query.chapterId && !isSiteWide) {
    throw createError({ statusCode: 400, message: 'Нужен chapterId или siteWide=1' })
  }

  const rows = isSiteWide
    ? await db.select().from(comments).where(isNull(comments.chapterId)).orderBy(desc(comments.createdAt))
    : await db.select().from(comments).where(eq(comments.chapterId, query.chapterId as string)).orderBy(desc(comments.createdAt))

  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map(r => r.userId).filter(Boolean))] as number[]
  const avatarMap = new Map<number, string | null>()

  if (userIds.length) {
    const userRows = await db.select({ id: users.id, avatarUrl: users.avatarUrl }).from(users)
    for (const u of userRows) avatarMap.set(u.id, u.avatarUrl ?? null)
  }

  const commentIds = rows.map(r => r.id)
  const allReactions = await db.select().from(commentReactions)

  const session = await getUserSession(event)
  const sessionUserId = (session.user as any)?.id ?? null
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'

  const reactionsByComment = new Map<number, { likes: number; dislikes: number; myReaction: string | null }>()
  for (const id of commentIds) reactionsByComment.set(id, { likes: 0, dislikes: 0, myReaction: null })

  for (const r of allReactions) {
    const bucket = reactionsByComment.get(r.commentId)
    if (!bucket) continue
    if (r.type === 'like') bucket.likes++
    else bucket.dislikes++

    const isMine = sessionUserId
      ? r.userId === sessionUserId
      : r.ip === ip && r.userId === null
    if (isMine) bucket.myReaction = r.type
  }

  return rows.map(r => ({
    ...r,
    avatarUrl: r.userId ? (avatarMap.get(r.userId) ?? null) : null,
    likes: reactionsByComment.get(r.id)!.likes,
    dislikes: reactionsByComment.get(r.id)!.dislikes,
    myReaction: reactionsByComment.get(r.id)!.myReaction,
  }))
})
