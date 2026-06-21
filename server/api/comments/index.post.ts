import { useDb } from '../../utils/db'
import { comments, users } from '../../database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
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

  if(!text){throw createError({ statusCode: 400, message: 'Текст комментария обязателен' })}

  const [created] = await db
    .insert(comments)
    .values({ authorName, body: text, chapterId, userId })
    .returning()

  return created
})
