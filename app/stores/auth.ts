export type SessionUser = {
  id: number
  email: string | null
  role: 'admin' | 'reader'
  displayName: string | null
  avatarUrl: string | null
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<SessionUser | null>(null)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isAuthed = computed(() => Boolean(user.value))

  /** Имя для показа: ник, часть почты до собаки или безликое «Читатель». */
  const name = computed(() =>
    user.value ? (user.value.displayName || user.value.email?.split('@')[0] || 'Читатель') : ''
  )

  async function fetchMe() {
    try {
      user.value = await $fetch('/api/auth/me')
    } catch {
      user.value = null
    }
  }

  async function login(email: string, password: string) {
    await $fetch('/api/auth/login', { method: 'POST', body: { email, password } })
    await fetchMe()
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  return { user, isAdmin, isAuthed, name, fetchMe, login, logout }
})
