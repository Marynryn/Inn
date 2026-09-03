import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'
import { userIdentities, users } from '../database/schema'
import { saveRemoteAvatar } from './avatar'
import { useDb } from './db'

export type Provider = 'google' | 'telegram'

/** Что мы забираем у провайдера. Всё, кроме id, необязательно. */
export type ProviderProfile = {
  id: string
  email?: string | null
  emailVerified?: boolean
  displayName?: string | null
  photoUrl?: string | null
}

export type SessionUser = {
  id: number
  email: string | null
  role: 'admin' | 'reader'
  displayName: string | null
  avatarUrl: string | null
}

type UserRow = typeof users.$inferSelect

export const toSessionUser = (u: UserRow): SessionUser => ({
  id: u.id,
  email: u.email,
  role: u.role,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl,
})

/** Имя для показа: ник, часть почты до собаки или безликое «Читатель». */
export const readerName = (u: Pick<UserRow, 'displayName' | 'email'>) =>
  u.displayName || u.email?.split('@')[0] || 'Читатель'

const AUTH_NEXT_COOKIE = 'auth_next'

/** Адрес внутри сайта — и только он. Чужой адрес превратил бы вход в открытый
 *  редирект: /auth/google?next=https://... уводил бы человека с сайта. */
const localPath = (value: unknown): string | null =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : null

/** Запоминает, куда вернуть человека после входа: у Google возврат приходит
 *  отдельным запросом, и кроме куки этот адрес донести нечем. */
export function rememberNext(event: H3Event) {
  const next = localPath(getQuery(event).next)
  if (!next) return

  setCookie(event, AUTH_NEXT_COOKIE, next, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: 600,
  })
}

/**
 * Куда вести дальше. Телеграм возвращается на тот же адрес, куда мы его послали,
 * — там наш next лежит прямо в query. У Google возврат приходит на голый
 * redirect URI без наших параметров, и адрес достаётся из куки, которую
 * поставил первый заход. Куку гасим в любом случае: она нужна на один вход.
 */
export function takeNext(event: H3Event): string {
  const fromCookie = getCookie(event, AUTH_NEXT_COOKIE)
  deleteCookie(event, AUTH_NEXT_COOKIE, { path: '/' })

  return localPath(getQuery(event).next) ?? localPath(fromCookie) ?? '/'
}

/**
 * Вход через провайдера: находит аккаунт по привязке, узнаёт по подтверждённой
 * почте или заводит новый — и ставит сессию.
 *
 * По почте склеиваем только когда провайдер её проверил. Непроверенной верить
 * нельзя: иначе чужой профиль забирается регистрацией на тот же адрес там, где
 * почту не сверяют. У телеграма почты нет вовсе, поэтому второй способ входа он
 * получает только явной привязкой из профиля.
 */
export async function loginWithProvider(
  event: H3Event,
  provider: Provider,
  profile: ProviderProfile,
): Promise<UserRow> {
  const db = useDb()
  const byId = async (id: number) => (await db.select().from(users).where(eq(users.id, id)))[0]

  // Вошедший человек, отправленный сюда со страницы профиля, привязывает второй
  // способ входа — привязка должна сесть на его аккаунт, а не завести двойника.
  const session = await getUserSession(event)
  const currentId = (session.user as { id?: number } | undefined)?.id ?? null

  const [link] = await db
    .select()
    .from(userIdentities)
    .where(and(eq(userIdentities.provider, provider), eq(userIdentities.providerUserId, profile.id)))

  if (currentId && link && link.userId !== currentId) {
    throw createError({ statusCode: 409, message: 'Этот аккаунт уже привязан к другому профилю' })
  }

  let user = link ? await byId(link.userId) : currentId ? await byId(currentId) : undefined

  const email = profile.email && profile.emailVerified
    ? profile.email.trim().toLowerCase()
    : null

  // По почте узнаём только незалогиненного: у вошедшего аккаунт уже известен.
  if (!user && email) {
    user = (await db.select().from(users).where(eq(users.email, email)))[0]
  }

  // Заблокированного разворачиваем до всякой записи в базу: не хватало, чтобы
  // попытка входа заводила ему новые привязки.
  if (user?.isBanned) {
    throw createError({ statusCode: 403, message: 'Аккаунт заблокирован' })
  }

  if (!user) {
    const [created] = await db
      .insert(users)
      .values({
        email,
        displayName: (profile.displayName ?? '').trim().slice(0, 40) || null,
        role: 'reader',
      })
      .returning()

    user = created!
  }

  if (!link) {
    await db.insert(userIdentities).values({
      userId: user.id,
      provider,
      providerUserId: profile.id,
    })
  }

  // Аватарку от провайдера берём, только если своей нет: подменять картинку,
  // которую человек загрузил руками, при каждом входе — не то, чего он ждёт.
  if (!user.avatarUrl && profile.photoUrl) {
    const avatarUrl = await saveRemoteAvatar(user.id, profile.photoUrl)
    if (avatarUrl) {
      await db.update(users).set({ avatarUrl }).where(eq(users.id, user.id))
      user = { ...user, avatarUrl }
    }
  }

  await setUserSession(event, { user: toSessionUser(user) })
  return user
}
