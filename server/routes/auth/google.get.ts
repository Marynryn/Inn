import { afterLogin, loginWithProvider, rememberNext } from '../../utils/identity'
import { publicOrigin } from '../../utils/public-origin'

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
      // Только безобидные поля: имя, почта, аватарка. Просить больше — значит
      // отправить приложение на проверку в Google, а нам этого не нужно.
      scope: ['openid', 'email', 'profile'],
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

      return sendRedirect(event, afterLogin(event, created))
    },

    onError(event, error) {
      console.error('[auth] google:', error)
      return sendRedirect(event, '/login?error=google')
    },
  })

  handlers.set(origin, handler)
  return handler
}

export default defineEventHandler((event) => {
  // Куда вернуть человека, знает только первый заход — с возврата от Google
  // никакого «откуда пришёл» уже не видно, поэтому запоминаем в куке.
  rememberNext(event)
  return handlerFor(publicOrigin(event))(event)
})
