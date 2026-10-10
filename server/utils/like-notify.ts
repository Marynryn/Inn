import { and, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm'
import { commentReactions, comments, notifications, users } from '../database/schema'
import type { AvatarFrame } from '#shared/utils/avatarFrames'
import { useDb } from './db'
import { framesByIds } from './frames'
import { readerName } from './identity'
import { wsToUser } from './ws-rooms'

/** Чужие лайки: свой лайк своему комментарию новостью не считается. */
const othersLikes = (commentId: number, ownerId: number) => and(
  eq(commentReactions.commentId, commentId),
  eq(commentReactions.type, 'like'),
  or(isNull(commentReactions.userId), ne(commentReactions.userId, ownerId)),
)

/**
 * Лайк поставлен — зажигаем уведомление автору комментария. Одна строка на
 * комментарий: новый лайк возвращает её в непрочитанные, а не добавляет ещё
 * одну. Зажигаем, только если лайков стало больше, чем было при прошлом
 * уведомлении: кто снял и поставил снова, второй раз не дёргает.
 */
export async function notifyLike(commentId: number, likerId: number | null) {
  const db = useDb()
  const [comment] = await db
    .select({ userId: comments.userId })
    .from(comments)
    .where(eq(comments.id, commentId))

  // Гостю класть некуда, а себе — незачем.
  const ownerId = comment?.userId
  if (!ownerId || ownerId === likerId) return

  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(commentReactions)
    .where(othersLikes(commentId, ownerId))

  const [existing] = await db
    .select({ id: notifications.id, likes: notifications.likes })
    .from(notifications)
    .where(and(eq(notifications.userId, ownerId), eq(notifications.commentId, commentId), eq(notifications.type, 'like')))

  if (!existing) {
    await db.insert(notifications)
      .values({ userId: ownerId, type: 'like', commentId, likes: total })
      .onConflictDoNothing()
  }
  else if (total > (existing.likes ?? 0)) {
    // Время тоже свежее: уведомление поднимается наверх списка.
    await db.update(notifications)
      .set({ likes: total, isRead: false, createdAt: sql`(datetime('now'))` })
      .where(eq(notifications.id, existing.id))
  }
  else return

  wsToUser(ownerId, { type: 'notification' })
}

export type LikeSummary = {
  likes: number
  liker: { name: string, avatarUrl: string | null, avatarFrame: AvatarFrame | null } | null
}

/**
 * Для колокольчика: сколько чужих лайков у каждого комментария и кто из
 * вошедших поставил последний — его имя и лицо и покажем. Гости безымянны.
 */
export async function likeSummaries(commentIds: number[], ownerId: number) {
  const out = new Map<number, LikeSummary>()
  if (!commentIds.length) return out

  const db = useDb()
  const notMine = or(isNull(commentReactions.userId), ne(commentReactions.userId, ownerId))
  const likesOn = and(inArray(commentReactions.commentId, commentIds), eq(commentReactions.type, 'like'), notMine)

  const totals = await db
    .select({ commentId: commentReactions.commentId, total: count() })
    .from(commentReactions)
    .where(likesOn)
    .groupBy(commentReactions.commentId)

  // Последние именные лайки по этим комментариям; первый попавшийся на
  // комментарий — самый свежий. Комментариев не больше десятка, строк немного.
  const named = await db
    .select({
      commentId: commentReactions.commentId,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      avatarFrameId: users.avatarFrameId,
    })
    .from(commentReactions)
    .innerJoin(users, eq(users.id, commentReactions.userId))
    .where(and(likesOn, isNotNull(commentReactions.userId)))
    .orderBy(desc(commentReactions.id))

  const frames = await framesByIds(named.map(n => n.avatarFrameId))
  const last = new Map<number, typeof named[number]>()
  for (const n of named) if (!last.has(n.commentId)) last.set(n.commentId, n)

  for (const t of totals) {
    const n = last.get(t.commentId)
    out.set(t.commentId, {
      likes: t.total,
      liker: n
        ? { name: readerName(n), avatarUrl: n.avatarUrl, avatarFrame: frames.get(n.avatarFrameId ?? 0) ?? null }
        : null,
    })
  }
  return out
}
