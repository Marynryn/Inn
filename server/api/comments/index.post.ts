import { useDb } from '../../utils/db'
import { comments, users } from '../../database/schema'
import { eq } from 'drizzle-orm'
import { checkRateLimit } from '../../utils/rate-limit'
import { wsBroadcast } from '../../utils/ws-rooms'

export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  if (!checkRateLimit(`comment:${ip}`, 5, 60_000)) {
    throw createError({ statusCode: 429, message: 'Слишком много комментариев. Подожди минуту.' })
  }

  const body = await readBody(event)
  const db = useDb()

  const session = await getUserSession(event)
  const sessionUser = session.user as { id: number; email: string } | undefined

  let authorName = String(body.authorName ?? 'Гость').trim().slice(0, 40) || 'Гость'
  let userId: number | null = null

  if(sessionUser?.id){
    const [user] = await db.select().from(users).where(eq(users.id, sessionUser.id))
    if(user){
      userId = user.id
      authorName = user.displayName || user.email.split('@')[0]
    }
  }

  const text = String(body.body ?? '').trim().slice(0, 500)
  const chapterId = body.chapterId ? String(body.chapterId) : null
  const isSpoiler = Boolean(body.isSpoiler)

  if(!text){throw createError({ statusCode: 400, message: 'Текст комментария обязателен' })}

  const [created] = await db
    .insert(comments)
    .values({ authorName, body: text, chapterId, userId, isSpoiler })
    .returning()

  const avatarUrl = userId
    ? (await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)))[0]?.avatarUrl ?? null
    : null

  const payload = { type: 'new_comment', comment: { ...created, avatarUrl, likes: 0, dislikes: 0, myReaction: null } }
  wsBroadcast(chapterId, payload)

  return created
})
