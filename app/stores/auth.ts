export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ id: number; email: string; role: string } | null>(null)
  const isAdmin = computed(() => user.value?.role === 'admin')

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

  return { user, isAdmin, fetchMe, login, logout }
})
