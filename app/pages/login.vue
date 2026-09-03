<script setup lang="ts">
const auth = useAuthStore()
const route = useRoute()
const origin = useRequestURL().origin

const { data: providers } = await useFetch('/api/auth/providers')

// Куда вернуть после входа. Чужие адреса не берём: ссылка вида
// /login?next=https://... превратила бы вход в открытый редирект.
const next = computed(() => {
  const raw = route.query.next
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
})

const googleHref = computed(() => `/auth/google?next=${encodeURIComponent(next.value)}`)

// Своя ссылка вместо виджета телеграма: их скрипт рисует кнопку с собственной
// подписью и оформлением, которые не поменять. Адрес тот же, что виджет
// открывает внутри себя, — телеграм вернётся к нам с подписанными полями.
const telegramHref = computed(() => {
  const botId = providers.value?.telegramBotId
  if (!providers.value?.telegram || !botId) return null

  const returnTo = `${origin}/auth/telegram?next=${encodeURIComponent(next.value)}`
  return 'https://oauth.telegram.org/auth'
    + `?bot_id=${botId}`
    + `&origin=${encodeURIComponent(origin)}`
    + `&return_to=${encodeURIComponent(returnTo)}`
})

// Вход по паролю остался ради панели, но с глаз убран: читателю он не нужен,
// а администратор попадает на него по /login?pw=1.
const showPassword = ref(route.query.pw === '1')
const email = ref('')
const password = ref('')
const error = ref(route.query.error === 'google' ? 'Google не завершил вход. Попробуй ещё раз.' : '')
const loading = ref(false)

const submit = async () => {
  error.value = ''
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    navigateTo(auth.isAdmin ? '/admin' : next.value)
  } catch (e: any) {
    error.value = e.data?.message || 'Неверный email или пароль'
  } finally {
    loading.value = false
  }
}

useHead({
  title: 'Вход · Странствующая Таверна',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <div class="login-page">
    <div class="login-box">
      <NuxtLink to="/" class="hearth" aria-label="На главную">
        <NuxtImg src="/hearth.png" width="40" height="40" format="webp" alt="" />
      </NuxtLink>

      <h1 class="display">Вход</h1>
      <p class="lead">Первый вход заводит аккаунт — регистрироваться отдельно не нужно.</p>

      <div v-if="error" class="err">{{ error }}</div>

      <a v-if="providers?.google" :href="googleHref" class="provider">
        <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        Google
      </a>

      <a v-if="telegramHref" :href="telegramHref" class="provider">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="12" r="12" fill="#2AABEE" />
          <path fill="#fff" d="M5.5 11.7c3.6-1.6 6-2.6 7.2-3.1 3.4-1.4 4.1-1.7 4.6-1.7.1 0 .3 0 .5.2.1.1.1.3.2.4v.4c-.2 1.7-.9 5.9-1.3 7.8-.2.8-.5 1.1-.8 1.1-.7.1-1.2-.4-1.8-.8-1-.7-1.6-1.1-2.6-1.7-1.1-.7-.4-1.1.2-1.8.2-.2 3-2.7 3-2.9 0 0 0-.1-.1-.2h-.2c-.1 0-1.7 1.1-4.7 3.2-.4.3-.8.4-1.2.4-.4 0-1.2-.2-1.7-.4-.7-.2-1.2-.3-1.1-.7 0-.2.3-.4.8-.6z" />
        </svg>
        Telegram
      </a>

      <form v-if="showPassword" class="pw-form" @submit.prevent="submit">
        <input v-model="email" type="email" placeholder="Email" autocomplete="email" required>
        <input v-model="password" type="password" placeholder="Пароль" autocomplete="current-password" required>
        <button type="submit" :disabled="loading">
          {{ loading ? 'Входим...' : 'Войти' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* Тот же тёплый градиент, что у героя на главной: плоский тёмный фон читался
   провалом, а этот держит те же угли, что и весь сайт. */
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: radial-gradient(120% 90% at 20% -10%, #3a2c22 0%, var(--bg-dark) 55%, var(--bg-dark-2) 100%);
  color: var(--parchment);
}

.login-box {
  width: 100%;
  max-width: 340px;
  padding: 36px 30px 32px;
  background: rgba(43, 34, 28, .55);
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: center;
}

.hearth {
  align-self: center;
  line-height: 0;
}

.login-box h1 {
  font-size: 27px;
  margin: 2px 0 0;
}

.lead {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
}

.err {
  font-size: 13px;
  color: #e07070;
}

/* ── Кнопки входа ───────────────────────────── */
.provider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(241, 230, 210, .2);
  background: rgba(241, 230, 210, .06);
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  transition: border-color .2s ease, background .2s ease;
}

.provider:hover {
  border-color: var(--gold);
  background: rgba(241, 230, 210, .11);
}

/* ── Вход по паролю: только для администратора, по /login?pw=1 ─ */
.pw-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
}

.pw-form input {
  background: rgba(241, 230, 210, .05);
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-sm);
  color: var(--parchment);
  padding: 11px 13px;
  font-family: var(--font-body);
  font-size: 14px;
}

.pw-form input:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

.pw-form button {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  background: var(--ember);
  color: var(--bg-dark);
  border: none;
  padding: 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.pw-form button:disabled {
  opacity: .5;
  cursor: not-allowed;
}
</style>
