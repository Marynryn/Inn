/**
 * Страница только для вошедших — без перехода в админку: настольная игра
 * открыта всем читателям, но фишке и чату нужно имя. Не вошёл — на вход, с
 * возвратом на ту же страницу (по ссылке на стол человек туда и вернётся).
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) {
    const { loggedIn } = useUserSession()
    if (loggedIn.value) return
  } else {
    const auth = useAuthStore()
    if (!auth.ready) await auth.fetchMe()
    if (auth.isAuthed) return
  }

  return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
})
