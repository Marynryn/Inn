import { and, count, desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { comments, notifications, users } from '../../database/schema'
import { useDb } from '../../utils/db'
import { framesByIds } from '../../utils/frames'

/**
 * Уведомления читателя: кто ответил на его комментарий. Гостю отдаём пустоту —
 * уведомления привязаны к аккаунту, а анонимный ключ живёт в одном браузере.
 *
 * Имя отвечающего, текст и глава берутся из самого комментария, а не из копии в
 * уведомлении: так список не расходится с правленым комментарием. Соединение
 * внутреннее, поэтому удалённый ответ выпадает из списка сам.
 *
 * В списке только непрочитанные: прочитанное уходит из ящика, чтобы он не
 * захламлялся. В базе строка остаётся — она же и держит обещание не уведомить
 * об одном ответе дважды.
 */

/**
 * Сколько уведомлений показываем. Десяти хватает: ящик не захламляется, а до
 * старых ответов всё равно доходят через сами комментарии, а не через список.
 */
const LIMIT = 10

/** Длина выдержки из ответа: строчки хватает, чтобы узнать разговор. */
const EXCERPT = 120

/** Своя реплика — только чтобы вспомнить, о чём речь. Половины строки довольно. */
const ANSWERED_EXCERPT = 60

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = (session.user as { id?: number } | undefined)?.id ?? null

  if (!userId) return { unread: 0, items: [] }

  const db = useDb()

  // Второе имя той же таблицы: одна строка — присланный ответ, другая — тот
  // комментарий читателя, на который отвечали. Без этого уведомление говорило
  // «Гриша ответил», не уточняя, на какой из твоих комментариев.
  const answered = alias(comments, 'answered')

  const rows = await db
    .select({
      id: notifications.id,
      isRead: notifications.isRead,
      createdAt: notifications.createdAt,
      commentId: comments.id,
      chapterId: comments.chapterId,
      authorName: comments.authorName,
      body: comments.body,
      isSpoiler: comments.isSpoiler,
      avatarUrl: users.avatarUrl,
      avatarFrameId: users.avatarFrameId,
      answeredBody: answered.body,
      answeredSpoiler: answered.isSpoiler,
    })
    .from(notifications)
    .innerJoin(comments, eq(comments.id, notifications.commentId))
    // Аватарка есть только у вошедшего: ответ гостя даёт NULL, и это нормально.
    .leftJoin(users, eq(users.id, comments.userId))
    // Соединение левое: у ответов, написанных до появления столбца, reply_to_id
    // пуст — уведомление всё равно должно показаться, просто без уточнения.
    .leftJoin(answered, eq(answered.id, comments.replyToId))
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
    .orderBy(desc(notifications.id))
    .limit(LIMIT)

  // Считаем отдельным запросом, а не по выданным строкам: непрочитанных может
  // быть больше, чем LIMIT, и тогда число на значке врало бы в меньшую сторону.
  // Соединение то же — уведомление об удалённом ответе считаться не должно.
  const [unread] = await db
    .select({ total: count() })
    .from(notifications)
    .innerJoin(comments, eq(comments.id, notifications.commentId))
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))

  const frames = await framesByIds(rows.map(r => r.avatarFrameId))

  return {
    unread: unread?.total ?? 0,
    items: rows.map(({ avatarFrameId, ...r }) => ({
      ...r,
      avatarFrame: frames.get(avatarFrameId ?? 0) ?? null,
      // Спойлер в уведомлении не раскрываем: читатель мог до этой главы не дойти.
      body: r.isSpoiler ? '[спойлер]' : r.body.slice(0, EXCERPT),
      // Свой же текст — коротким напоминанием, о чём был разговор. Спойлер
      // прячем и здесь: уведомление могут читать через плечо.
      answeredBody: r.answeredBody
        ? (r.answeredSpoiler ? '[спойлер]' : r.answeredBody.slice(0, ANSWERED_EXCERPT))
        : null,
    })),
  }
})
