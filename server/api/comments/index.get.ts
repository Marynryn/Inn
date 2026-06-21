import { useDb } from '../../utils/db'
import { comments, users } from '../../database/schema'
import { eq, isNull, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const db = useDb()

  const isSiteWide = query.siteWide === '1' || query.site === 'true'

  if(!query.chapterId && !isSiteWide){
    throw createError({ statusCode: 400, message: 'Нужен chapterId или siteWide=1' })
  }

  const rows = isSiteWide
    ? await db.select().from(comments).where(isNull(comments.chapterId)).orderBy(desc(comments.createdAt))
    : await db.select().from(comments).where(eq(comments.chapterId, query.chapterId as string)).orderBy(desc(comments.createdAt))

  const userIds = [...new Set(rows.map(r => r.userId).filter(Boolean))] as number[]
  const avatarMap = new Map<number, string | null>()

  if(userIds.length){
    const userRows = await db.select({ id: users.id, avatarUrl: users.avatarUrl }).from(users)
    for(const u of userRows){
      avatarMap.set(u.id, u.avatarUrl ?? null)
    }
  }

  return rows.map(r => ({
    ...r,
    avatarUrl: r.userId ? (avatarMap.get(r.userId) ?? null) : null,
  }))
})
