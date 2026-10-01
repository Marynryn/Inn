import { useDb } from '../../utils/db'
import { comments, users, commentReactions } from '../../database/schema'
import { eq, isNull, desc, and } from 'drizzle-orm'
import { framesByIds } from '../../utils/frames'
import { figureById } from '#shared/utils/nameFigures'

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
  const frameIdMap = new Map<number, number | null>()
  const codeMap = new Map<number, string | null>()
  const figureMap = new Map<number, string | null>()

  if (userIds.length) {
    const userRows = await db
      .select({ id: users.id, avatarUrl: users.avatarUrl, avatarFrameId: users.avatarFrameId, publicId: users.publicId, figure: users.figure })
      .from(users)
    for (const u of userRows) {
      avatarMap.set(u.id, u.avatarUrl ?? null)
      frameIdMap.set(u.id, u.avatarFrameId ?? null)
      codeMap.set(u.id, u.publicId ?? null)
      figureMap.set(u.id, u.figure ?? null)
    }
  }

  // Рамки одним запросом на всю страницу: их на весь сайт десяток, и тянуть
  // картинку заново под каждым комментарием ни к чему.
  const frames = await framesByIds(userIds.map(id => frameIdMap.get(id) ?? null))

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

  // Номер автора наружу не отдаём — по нему видно, сколько на сайте
  // читателей. Для ссылки на его страницу есть публичный код.
  return rows.map(({ userId, ...r }) => ({
    ...r,
    authorCode: userId ? (codeMap.get(userId) ?? null) : null,
    avatarUrl: userId ? (avatarMap.get(userId) ?? null) : null,
    avatarFrame: userId ? (frames.get(frameIdMap.get(userId) ?? 0) ?? null) : null,
    authorFigure: userId ? figureById(figureMap.get(userId)) : null,
    likes: reactionsByComment.get(r.id)!.likes,
    dislikes: reactionsByComment.get(r.id)!.dislikes,
    myReaction: reactionsByComment.get(r.id)!.myReaction,
  }))
})
