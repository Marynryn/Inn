<script setup lang="ts">
const auth = useAuthStore()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const submit = async () => {
  error.value = ''
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    navigateTo('/admin')
  } catch (e: any) {
    error.value = e.data?.message || 'Неверный email или пароль'
  } finally {
    loading.value = false
  }
}

useHead({ title: 'Вход · Странствующая Таверна' })
</script>

<template>
  <div class="login-wrap">
    <form class="login-form" @submit.prevent="submit">
      <h1 class="display">Вход</h1>
      <div v-if="error" class="login-error">{{ error }}</div>
      <input v-model="email" type="email" placeholder="Email" autocomplete="email" required>
      <input v-model="password" type="password" placeholder="Пароль" autocomplete="current-password" required>
      <button type="submit" :disabled="loading">
        {{ loading ? 'Входим...' : 'Войти' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-dark);
  color: var(--parchment);
}

.login-form {
  width: 100%;
  max-width: 360px;
  padding: 40px 32px;
  background: var(--bg-dark-2);
  border-radius: var(--radius-md);
  border: 1px solid rgba(241, 230, 210, .1);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-form h1 {
  font-size: 26px;
  margin: 0 0 8px;
}

.login-error {
  font-size: 13px;
  color: #e07070;
}

.login-form input {
  background: rgba(241, 230, 210, .05);
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-md);
  color: var(--parchment);
  padding: 11px 14px;
  font-family: var(--font-body);
  font-size: 14px;
}

.login-form input:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

.login-form button {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  background: var(--ember);
  color: var(--bg-dark);
  border: none;
  padding: 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  margin-top: 4px;
}

.login-form button:disabled {
  opacity: .5;
  cursor: not-allowed;
}
</style>
