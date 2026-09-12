import { withQuery } from 'ufo'
import { sendBrowserRedirect } from '../../utils/browser-redirect'
import { afterLogin, loginWithProvider, rememberNext } from '../../utils/identity'
import { publicOrigin } from '../../utils/public-origin'

const SCOPE = ['openid', 'email', 'profile']

/**
 * Вход через Google. Обмен кода на токен и запрос профиля делает сам
 * nuxt-auth-utils — нам остаётся сверить, что почта подтверждена, и завести
 * сессию. Этот же адрес прописывается в консоли Google как redirect URI.
 *
 * Адрес возврата — по домену, на котором человек открыл сайт, а не по Host
 * запроса: за CDN зеркала они разные, и Google возвращал бы на служебное имя
 * Railway, где кука сессии никому не нужна. Обработчик собирается на каждый
 * домен свой, один раз.
 */
const handlers = new Map<string, ReturnType<typeof defineOAuthGoogleEventHandler>>()

const handlerFor = (origin: string) => {
  let handler = handlers.get(origin)
  if (handler) return handler

  handler = defineOAuthGoogleEventHandler({
    config: {
      scope: SCOPE,
      redirectURL: `${origin}/auth/google`,
    },

    async onSuccess(event, { user }) {
      const { created } = await loginWithProvider(event, 'google', {
        id: String(user.sub),
        email: user.email ?? null,
        emailVerified: user.email_verified === true,
        displayName: user.name ?? user.given_name ?? null,
        photoUrl: user.picture ?? null,
      })

      return sendBrowserRedirect(event, afterLogin(event, created))
    },

    onError(event, error) {
      console.error('[auth] google:', error)
      return sendBrowserRedirect(event, '/login?error=google')
    },
  })

  handlers.set(origin, handler)
  return handler
}

export default defineEventHandler((event) => {
  const origin = publicOrigin(event)
  const { code } = getQuery(event)

  // Возврат от Google: код на токен, профиль, сессия — всё в обработчике.
  if (code) return handlerFor(origin)(event)

  // Первый заход. Куда вернуть человека, знает только он — с возврата от Google
  // никакого «откуда пришёл» уже не видно, поэтому запоминаем в куке.
  rememberNext(event)

  // Отправку к Google обработчик делает через 302, а за CDN зеркала это не
  // работает (см. sendBrowserRedirect) — поэтому адрес собираем сами, теми же
  // параметрами. Ключи проверяем как он: без них — на страницу входа с ошибкой.
  // Только безобидные поля: имя, почта, аватарка. Просить больше — значит
  // отправить приложение на проверку в Google, а нам этого не нужно.
  const { clientId, clientSecret } = useRuntimeConfig(event).oauth.google
  if (!clientId || !clientSecret) {
    console.error('[auth] google: нет NUXT_OAUTH_GOOGLE_CLIENT_ID или NUXT_OAUTH_GOOGLE_CLIENT_SECRET')
    return sendBrowserRedirect(event, '/login?error=google')
  }

  return sendBrowserRedirect(event, withQuery('https://accounts.google.com/o/oauth2/v2/auth', {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: `${origin}/auth/google`,
    scope: SCOPE.join(' '),
    state: '',
  }))
})
