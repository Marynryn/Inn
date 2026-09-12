<script setup lang="ts">
const auth = useAuthStore()
const route = useRoute()

const { data: providers } = await useFetch('/api/auth/providers')

// Куда вернуть после входа. Чужие адреса не берём: ссылка вида
// /login?next=https://... превратила бы вход в открытый редирект.
const next = computed(() => {
  const raw = route.query.next
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
})

const googleHref = computed(() => `/auth/google?next=${encodeURIComponent(next.value)}`)

// Своя ссылка вместо виджета телеграма: их скрипт рисует кнопку с собственной
// подписью и оформлением, которые не поменять. Ведёт на наш же адрес — он и
// отправляет к телеграму, зная свой origin точнее, чем браузер.
const telegramHref = computed(() =>
  providers.value?.telegram ? `/auth/telegram?next=${encodeURIComponent(next.value)}` : null
)

// Вход по паролю остался ради панели, но с глаз убран: читателю он не нужен,
// а администратор попадает на него по /login?pw=1.
const showPassword = ref(route.query.pw === '1')
const email = ref('')
const password = ref('')
// Причина от сервера — коротким кодом («403:Аккаунт заблокирован»,
// «400:invalid_grant»): человеку она мало что скажет, зато её можно прислать
// нам, и станет ясно, где споткнулись.
const reason = typeof route.query.reason === 'string' ? route.query.reason.slice(0, 80) : ''
const failed = route.query.error === 'google' ? 'Google' : route.query.error === 'telegram' ? 'Telegram' : null
const error = ref(failed ? `${failed} не завершил вход. Попробуй ещё раз.${reason ? ` (${reason})` : ''}` : '')
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
    <!--
      Вход происходит на свитке, который держит хозяйка гильдии: картинка нарочно
      оставлена пустой посередине, туда и ложится форма. На узких экранах сцена
      целиком не читается — там свой кадр, один пергамент крупным планом.
    -->
    <div class="scene">
      <!-- Кадр картинки: повторяет её геометрию при обрезке, чтобы форма
           оставалась на свитке, сколько бы ни срезали по краям. -->
      <div class="frame">
      <div class="sheet">
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

        <NuxtLink to="/" class="back">В таверну</NuxtLink>
      </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: radial-gradient(120% 90% at 20% -10%, #3a2c22 0%, var(--bg-dark) 55%, var(--bg-dark-2) 100%);
  color: var(--parchment);
}

/*
  Картинка кроет весь экран, лишнее по краям срезается. Форма при этом стоит не
  относительно окна, а относительно самой картинки: .frame повторяет её размер
  при такой обрезке, поэтому свиток остаётся под формой при любых пропорциях.
  Размеры внутри считаются от ширины кадра (cqw), а clamp не даёт форме стать
  нечитаемо мелкой или неуклюже крупной.
*/
.scene {
  position: fixed;
  inset: 0;
  background: url('/login.webp') center / cover no-repeat;
  overflow: hidden;
}

.frame {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: max(100vw, 100vh * 1699 / 926);
  height: max(100vh, 100vw * 926 / 1699);
  container-type: inline-size;
}

.sheet {
  position: absolute;
  left: 28%;
  top: 26%;
  width: 24.5%;
  height: 56%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: clamp(6px, 1cqw, 12px);
  text-align: center;
  /* Тёмная охра вместо пергаментного цвета: текст лежит на самом пергаменте. */
  color: #3f2c1a;
}

/* Возврат на сайт: подписью пером по пергаменту, а не кнопкой. */
.back {
  align-self: center;
  margin-top: clamp(2px, .4cqw, 6px);
  font-size: clamp(10px, 1.05cqw, 13px);
  color: #7a5f3c;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.back:hover { color: var(--ember); }

.sheet h1 {
  font-size: clamp(20px, 2.6cqw, 32px);
  margin: 0;
  color: #35240f;
}

.lead {
  margin: 0;
  font-size: clamp(11px, 1.15cqw, 14px);
  line-height: 1.45;
  color: #6a5136;
}

.err {
  font-size: clamp(11px, 1.1cqw, 13px);
  color: #9b2b21;
}

/* ── Кнопки входа ───────────────────────────── */
.provider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(6px, .8cqw, 10px);
  /* Кнопка по своему содержимому, а не во всю ширину пергамента: растянутая
     во весь свиток она читалась плашкой, а не кнопкой. */
  width: 100%;
  padding: clamp(8px, 1.05cqw, 13px) clamp(16px, 2cqw, 28px);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(80, 56, 30, .35);
  background: rgba(255, 249, 235, .55);
  color: #3f2c1a;
  font-family: var(--font-body);
  font-size: clamp(12px, 1.25cqw, 15px);
  font-weight: 500;
  transition: border-color .2s ease, background .2s ease;
}

.provider:hover {
  border-color: var(--ember);
  background: rgba(255, 252, 244, .82);
}

.provider svg {
  width: clamp(14px, 1.5cqw, 18px);
  height: auto;
}

/* ── Вход по паролю: только для администратора, по /login?pw=1 ─ */
.pw-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: clamp(6px, .7cqw, 10px);
}

.pw-form input {
  background: rgba(255, 250, 238, .7);
  border: 1px solid rgba(80, 56, 30, .3);
  border-radius: var(--radius-sm);
  color: #3f2c1a;
  padding: clamp(7px, .9cqw, 11px) clamp(9px, 1cqw, 13px);
  font-family: var(--font-body);
  font-size: clamp(12px, 1.2cqw, 14px);
  width: 100%;
}

.pw-form input::placeholder { color: #93795a; }

.pw-form input:focus-visible {
  outline: none;
  border-color: var(--ember);
}

.pw-form button {
  font-family: var(--font-body);
  font-size: clamp(12px, 1.2cqw, 14px);
  font-weight: 500;
  background: var(--ember);
  color: #2b221c;
  border: none;
  padding: clamp(8px, 1cqw, 12px);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.pw-form button:disabled {
  opacity: .5;
  cursor: not-allowed;
}

/*
  На узком экране широкий кадр не читается: там свой, вертикальный, и свиток
  на нём занимает почти всю высоту — форма ложится туда же.
*/
@media (max-width: 760px) {
  .login-page { padding: 0; }

  .scene { background-image: url('/login-mobile.webp'); }

  .frame {
    width: max(100vw, 100vh * 940 / 1672);
    height: max(100vh, 100vw * 1672 / 940);
  }

  /* Координаты сняты с самой login-mobile.webp: лист без нижнего рулона занимает
     по вертикали 26.0…74.3% кадра (центр 50.15%). Форма центрируется внутри
     .sheet, поэтому центр блока = центр её рамки: top = 50.15 − 43/2.
     По горизонтали абсолютную долю кадра брать нельзя: .scene кроет видимый
     вьюпорт, а .frame считается в vh, и на мобильном хроме с показанной адресной
     строкой это разные высоты — доли кадра и экрана расходятся. Поэтому взят
     замер РАЗНИЦЫ по снимку живой страницы: центр кнопок стоял левее оси
     пергамента на 1.45% кадра, отсюда left 16.5 → 18. */
  .sheet {
    left: 18%;
    width: 37%;
    top: 28.7%;
    height: 43%;
  }

  .sheet h1 { font-size: clamp(18px, 6cqw, 26px); }
  .lead { font-size: clamp(10px, 2.6cqw, 13px); }
  .provider { font-size: clamp(11px, 3cqw, 14px); padding: clamp(7px, 2.4cqw, 11px); gap: 6px; }
  .provider svg { width: clamp(13px, 3.4cqw, 16px); }
  .err { font-size: clamp(10px, 2.6cqw, 12px); }
  .pw-form input, .pw-form button { font-size: clamp(11px, 2.8cqw, 13px); }
}
</style>
