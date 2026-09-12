/**
 * Панель — только администратору. Проверка идёт до рендера: на сервере — по
 * сессии из куки, чтобы чужой не увидел даже каркас панели; на клиенте — по
 * уже известному пользователю (после входа он в сторе), а если стор ещё пуст —
 * спросить сервер. Остальных — на вход, с возвратом сюда же.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) {
    const { user } = useUserSession()
    if ((user.value as { role?: string } | null)?.role === 'admin') return
  } else {
    const auth = useAuthStore()
    if (!auth.user) await auth.fetchMe()
    if (auth.isAdmin) return
  }

  return navigateTo(`/login?pw=1&next=${encodeURIComponent(to.fullPath)}`)
})
