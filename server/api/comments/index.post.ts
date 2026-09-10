import { normalizeDisplayName } from '#shared/utils/displayName'
import { isNameFreeForGuest } from '../../utils/display-name'
import { useDb } from '../../utils/db'
import { comments, notifications, users } from '../../database/schema'
import { eq } from 'drizzle-orm'
import { checkRateLimit } from '../../utils/rate-limit'
import { wsBroadcast, wsToUser } from '../../utils/ws-rooms'
import { readerName } from '../../utils/identity'
import { frameById } from '../../utils/frames'

export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  if (!checkRateLimit(`comment:${ip}`, 5, 60_000)) {
    throw createError({ statusCode: 429, message: 'Слишком много комментариев. Подожди минуту.' })
  }

  const body = await readBody(event)
  const db = useDb()

  const session = await getUserSession(event)
  const sessionUser = session.user as { id: number; email: string } | undefined

  let authorName = 'Гость'
  let userId: number | null = null

  if (sessionUser?.id) {
    const [user] = await db.select().from(users).where(eq(users.id, sessionUser.id))
    if (user) {
      userId = user.id
      authorName = readerName(user)
    }
  }
  else {
    // Имя гостя — единственная подпись, которая берётся прямо из формы. Занятое
    // читателем имя гостю не отдаём, служебное — тем более: иначе назваться
    // администратором мог бы кто угодно. Не назвавшийся остаётся «Гостем».
    const name = normalizeDisplayName(body.authorName)

    if (!await isNameFreeForGuest(name)) {
      throw createError({ statusCode: 409, message: 'Имя занято, выбери другое' })
    }

    authorName = name || 'Гость'
  }

  const text = String(body.body ?? '').trim().slice(0, 500)
  const isSpoiler = Boolean(body.isSpoiler)

  if(!text){throw createError({ statusCode: 400, message: 'Текст комментария обязателен' })}

  // Ответ. Главу и корень ветки берём у родителя, а не из запроса: иначе
  // подделанным chapterId ответ утащило бы в чужое обсуждение. Ветка
  // одноуровневая, поэтому ответ на ответ цепляется к тому же корню.
  let parentId: number | null = null
  let replyToId: number | null = null
  let chapterId = body.chapterId ? String(body.chapterId) : null
  let parent: typeof comments.$inferSelect | undefined

  if (body.parentId != null) {
    const id = Number(body.parentId)
    if (!Number.isInteger(id)) {
      throw createError({ statusCode: 400, message: 'Неверный parentId' })
    }

    ;[parent] = await db.select().from(comments).where(eq(comments.id, id))
    if (!parent) {
      throw createError({ statusCode: 404, message: 'Комментарий, на который ты отвечаешь, уже удалён' })
    }

    // Корень — чтобы ответ встал на место в ветке; сам родитель — чтобы было
    // видно, к кому обращались, и чтобы уведомление могло это назвать.
    parentId = parent.parentId ?? parent.id
    replyToId = parent.id
    chapterId = parent.chapterId
  }

  const [created] = await db
    .insert(comments)
    .values({ authorName, body: text, chapterId, userId, isSpoiler, parentId, replyToId })
    .returning()

  // Уведомляем того, кому отвечали. Гостю положить некуда — у него нет
  // аккаунта. Себе не уведомляем: человек это и написал только что. Уведомление
  // вешаем на автора той реплики, по которой нажали «Ответить», а не на автора
  // корня: обращались именно к нему.
  if (parent?.userId && parent.userId !== userId) {
    await db
      .insert(notifications)
      .values({ userId: parent.userId, commentId: created!.id })
      .onConflictDoNothing()

    // Толкаем в личную комнату, если читатель сейчас на сайте. Само уведомление
    // не пересылаем — только «загляни ещё раз»: пусть браузер перечитает его
    // тем же обработчиком, что и всегда. Иначе выдержку, спойлер и аватарку
    // пришлось бы собирать в двух местах, и они бы разошлись.
    wsToUser(parent.userId, { type: 'notification' })
  }

  // Аватарка с рамкой — тем, кто читает главу прямо сейчас: комментарий
  // приходит им сокетом и мимо выборки, которая всё это собирает.
  const author = userId
    ? (await db
        .select({ avatarUrl: users.avatarUrl, avatarFrameId: users.avatarFrameId })
        .from(users)
        .where(eq(users.id, userId)))[0]
    : null

  const avatarUrl = author?.avatarUrl ?? null
  const avatarFrame = await frameById(author?.avatarFrameId)

  const payload = { type: 'new_comment', comment: { ...created, avatarUrl, avatarFrame, likes: 0, dislikes: 0, myReaction: null } }
  wsBroadcast(chapterId, payload)

  return created
})
