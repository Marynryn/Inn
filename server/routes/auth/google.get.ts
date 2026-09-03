import { loginWithProvider, rememberNext, takeNext } from '../../utils/identity'

/**
 * Вход через Google. Обмен кода на токен и запрос профиля делает сам
 * nuxt-auth-utils — нам остаётся сверить, что почта подтверждена, и завести
 * сессию. Этот же адрес прописывается в консоли Google как redirect URI.
 */
const handler = defineOAuthGoogleEventHandler({
  config: {
    // Только безобидные поля: имя, почта, аватарка. Просить больше — значит
    // отправить приложение на проверку в Google, а нам этого не нужно.
    scope: ['openid', 'email', 'profile'],
  },

  async onSuccess(event, { user }) {
    await loginWithProvider(event, 'google', {
      id: String(user.sub),
      email: user.email ?? null,
      emailVerified: user.email_verified === true,
      displayName: user.name ?? user.given_name ?? null,
      photoUrl: user.picture ?? null,
    })

    return sendRedirect(event, takeNext(event))
  },

  onError(event, error) {
    console.error('[auth] google:', error)
    return sendRedirect(event, '/login?error=google')
  },
})

export default defineEventHandler((event) => {
  // Куда вернуть человека, знает только первый заход — с возврата от Google
  // никакого «откуда пришёл» уже не видно, поэтому запоминаем в куке.
  rememberNext(event)
  return handler(event)
})
