<script setup lang="ts">
import type { AvatarFrame, OwnedFrame } from '#shared/utils/avatarFrames'

const auth = useAuthStore()
const { data: settings } = await useFetch('/api/settings')

type Profile = {
  id: number
  email: string | null
  role: string
  displayName: string | null
  avatarUrl: string | null
  avatarFrame: AvatarFrame | null
  frames: OwnedFrame[]
  hasPassword: boolean
  providers: ('google' | 'telegram')[]
}

const { data: profile, refresh, error: loadError } = await useFetch<Profile>('/api/profile')

// Страница целиком про своего пользователя — гостю тут показывать нечего.
watchEffect(() => {
  if (loadError.value) navigateTo('/login?next=/profile')
})

const displayName = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const preview = ref<string | null>(null)
const saving = ref(false)
const message = ref('')
const error = ref('')

const frameId = ref<number | null>(null)

watchEffect(() => {
  displayName.value = profile.value?.displayName ?? ''
  frameId.value = profile.value?.avatarFrame?.id ?? null
})

// Рамка показывается на своей же аватарке сразу при выборе, до сохранения:
// решить, идёт она или нет, можно только глядя на своё лицо в ней.
const frames = computed(() => profile.value?.frames ?? [])
// Хозяйке сайта сервер отдаёт весь каталог, а не только выигранное: рамку надо
// примерить на живом лице раньше, чем она кому-то достанется.
const isAdmin = computed(() => profile.value?.role === 'admin')
const chosenFrame = computed(() => frames.value.find(f => f.id === frameId.value) ?? null)

const avatarSrc = computed(() => preview.value || profile.value?.avatarUrl || null)

const pickFile = () => fileInput.value?.click()

const onFile = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    error.value = 'Картинка больше 5 МБ'
    return
  }
  error.value = ''
  preview.value = URL.createObjectURL(file)
}

/**
 * Уменьшает картинку до 256×256 прямо в браузере, обрезая по центру. Этим
 * занимался sharp на сервере, но это нативная библиотека: nitro упаковывал её
 * js и терял libvips, и сайт не запускался. Canvas есть у всех и справляется.
 */
const toSmallSquare = (file: File): Promise<Blob> => new Promise((resolve) => {
  const img = new Image()
  const url = URL.createObjectURL(file)

  img.onload = () => {
    URL.revokeObjectURL(url)
    const side = Math.min(img.width, img.height)
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256

    const ctx = canvas.getContext('2d')
    if (!ctx) return resolve(file)

    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256)
    canvas.toBlob(blob => resolve(blob ?? file), 'image/webp', 0.85)
  }

  // Не открылась — отправим как есть, сервер сам проверит, картинка ли это.
  img.onerror = () => {
    URL.revokeObjectURL(url)
    resolve(file)
  }

  img.src = url
})

const save = async () => {
  saving.value = true
  error.value = ''
  message.value = ''

  try {
    const form = new FormData()
    form.append('displayName', displayName.value)
    form.append('avatarFrameId', frameId.value ? String(frameId.value) : '')
    const file = fileInput.value?.files?.[0]
    if (file) form.append('avatar', await toSmallSquare(file), 'avatar.webp')

    await $fetch('/api/profile', { method: 'PUT', body: form })
    preview.value = null
    if (fileInput.value) fileInput.value.value = ''
    await Promise.all([refresh(), auth.fetchMe()])
    message.value = 'Сохранено'
  } catch (e: any) {
    error.value = e.data?.message || 'Не сохранилось'
  } finally {
    saving.value = false
  }
}

const unlink = async (provider: 'google' | 'telegram') => {
  error.value = ''
  try {
    await $fetch('/api/profile/unlink', { method: 'POST', body: { provider } })
    await refresh()
  } catch (e: any) {
    error.value = e.data?.message || 'Не отвязалось'
  }
}

const logout = async () => {
  await auth.logout()
  navigateTo('/')
}

const has = (p: 'google' | 'telegram') => profile.value?.providers.includes(p) ?? false

useHead({
  title: 'Профиль · Странствующая Таверна',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <div class="profile-page">
    <AppHeader
      show-nav-links
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />

    <div class="profile-wrap">
      <h1 class="display profile-title">Профиль</h1>

      <div v-if="profile" class="profile-card">
        <div class="avatar-row">
          <button class="avatar-btn" type="button" @click="pickFile">
            <UserAvatar
              class="avatar-face"
              :src="avatarSrc"
              :name="displayName || profile.email"
              :frame="chosenFrame"
              :size="72"
              alt="Аватарка"
            />
            <span class="avatar-hint">Сменить</span>
          </button>
          <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile">

          <div class="name-field">
            <label for="pf-name">Имя под комментариями</label>
            <input id="pf-name" v-model="displayName" type="text" maxlength="40" placeholder="Как тебя звать">
          </div>
        </div>

        <div class="form-foot">
          <button class="save-btn" type="button" :disabled="saving" @click="save">
            {{ saving ? 'Сохраняем...' : 'Сохранить' }}
          </button>
          <span v-if="message" class="ok-msg">{{ message }}</span>
          <span v-if="error" class="err-msg">{{ error }}</span>
        </div>

        <hr class="divider">

        <h2 class="section-title">Рамка</h2>

        <p v-if="!frames.length" class="section-note">
          <template v-if="isAdmin">В каталоге пока пусто — рамки заводятся в панели.</template>
          <template v-else>Рамки достаются за участие в ивентах таверны. Как выиграешь — появится здесь.</template>
        </p>

        <template v-else>
          <p class="section-note">
            <template v-if="isAdmin">Тебе показан весь каталог — читатель видит только выигранное.</template>
            <template v-else>Носить можно любую из своих — или ходить без рамки.</template>
          </p>

          <div class="frame-grid">
            <button
              class="frame-pick"
              type="button"
              :class="{ active: frameId === null }"
              @click="frameId = null"
            >
              <UserAvatar
                class="frame-face"
                :src="avatarSrc"
                :name="displayName || profile.email"
                :frame="null"
                :size="48"
                alt=""
              />
              <span class="frame-name">Без рамки</span>
            </button>

            <button
              v-for="f in frames"
              :key="f.id"
              class="frame-pick"
              type="button"
              :class="{ active: frameId === f.id }"
              @click="frameId = f.id"
            >
              <UserAvatar
                class="frame-face"
                :src="avatarSrc"
                :name="displayName || profile.email"
                :frame="f"
                :size="48"
                alt=""
              />
              <span class="frame-name">{{ f.name }}</span>
              <span v-if="!f.owned" class="frame-tag">примерка</span>
            </button>
          </div>
        </template>

        <hr class="divider">

        <h2 class="section-title">Способы входа</h2>
        <p class="section-note">
          Можно привязать оба — тогда войти получится любым.
        </p>

        <div class="provider-row">
          <span class="provider-name">Google</span>
          <template v-if="has('google')">
            <span class="provider-state">привязан</span>
            <button class="link-btn" type="button" @click="unlink('google')">Отвязать</button>
          </template>
          <a v-else class="link-btn" href="/auth/google?next=/profile">Привязать</a>
        </div>

        <div class="provider-row">
          <span class="provider-name">Telegram</span>
          <template v-if="has('telegram')">
            <span class="provider-state">привязан</span>
            <button class="link-btn" type="button" @click="unlink('telegram')">Отвязать</button>
          </template>
          <NuxtLink v-else class="link-btn" to="/login?next=/profile">Привязать</NuxtLink>
        </div>

        <hr class="divider">

        <div class="foot-row">
          <NuxtLink to="/progress" class="link-btn">Прогресс чтения</NuxtLink>
          <NuxtLink v-if="profile.role === 'admin'" to="/admin" class="link-btn">Панель</NuxtLink>
          <button class="link-btn" type="button" @click="logout">Выйти</button>
        </div>
      </div>
    </div>

    <AppFooter :settings="settings as any" on-dark />
  </div>
</template>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: var(--bg-dark);
  color: var(--parchment);
  display: flex;
  flex-direction: column;
}

.profile-wrap {
  flex: 1;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: 96px 24px 64px;
}

.profile-title {
  font-size: 30px;
  margin: 0 0 24px;
}

.profile-card {
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .1);
  border-radius: var(--radius-md);
  padding: 28px 24px;
}

/* ── Аватарка и имя ─────────────────────────── */
.avatar-row {
  display: flex;
  align-items: center;
  gap: 20px;
}

/* Кнопка не режет содержимое по кругу: рамка на то и рамка, чтобы выходить
   за края аватарки. Круглой формой занимаются те, кому она нужна, — сама
   аватарка и подсказка поверх неё. */
.avatar-btn {
  position: relative;
  width: 72px;
  height: 72px;
  flex: 0 0 72px;
  border: none;
  background: none;
  color: var(--parchment);
  cursor: pointer;
  padding: 0;
}

.avatar-face {
  border: 1px solid rgba(241, 230, 210, .18);
  background: rgba(241, 230, 210, .05);
}

/* Подсказка кроет аватарку целиком — иначе полоска понизу торчала бы
   прямоугольником из-под рамки. Лежит выше рамки: её должно быть видно. */
.avatar-hint {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 11px;
  background: rgba(31, 24, 19, .78);
  opacity: 0;
  transition: opacity .2s ease;
}

.avatar-btn:hover .avatar-hint,
.avatar-btn:focus-visible .avatar-hint {
  opacity: 1;
}

.name-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.name-field label {
  font-size: 12px;
  opacity: .5;
}

.name-field input {
  background: rgba(241, 230, 210, .05);
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-md);
  color: var(--parchment);
  padding: 10px 13px;
  font-family: var(--font-body);
  font-size: 14px;
  width: 100%;
}

.name-field input:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

.form-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
}

.save-btn {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  background: var(--ember);
  color: var(--bg-dark);
  border: none;
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.save-btn:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.ok-msg { font-size: 13px; color: var(--moss); }
.err-msg { font-size: 13px; color: #e07070; }

/* ── Рамка ──────────────────────────────────── */
/* Просвет между рамками щедрее обычного: рамка вылезает за круг, и на тесной
   сетке соседки наезжали бы друг на друга. */
.frame-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 18px;
}

.frame-pick {
  width: 78px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 10px 4px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: none;
  color: var(--parchment);
  font-family: var(--font-body);
  cursor: pointer;
}

.frame-pick:hover {
  background: rgba(241, 230, 210, .05);
}

.frame-pick.active {
  border-color: var(--ember-soft);
  background: rgba(241, 230, 210, .05);
}

.frame-face {
  background: rgba(241, 230, 210, .08);
}

.frame-name {
  font-size: 11px;
  line-height: 1.25;
  opacity: .6;
  text-align: center;
}

.frame-pick.active .frame-name {
  opacity: .9;
}

/* Рамка из каталога, но не выигранная: так помечено то, что видно только
   хозяйке сайта, — чтобы не спутать примерку со своей наградой. */
.frame-tag {
  font-size: 9.5px;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--ember-soft);
  opacity: .65;
}

/* ── Способы входа ──────────────────────────── */
.divider {
  border: none;
  border-top: 1px solid rgba(241, 230, 210, .1);
  margin: 26px 0 20px;
}

.section-title {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 4px;
}

.section-note {
  margin: 0 0 14px;
  font-size: 12px;
  opacity: .45;
}

.provider-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
}

.provider-name {
  font-size: 14px;
  min-width: 92px;
}

.provider-state {
  font-size: 12px;
  color: var(--moss);
  flex: 1;
}

.link-btn {
  margin-left: auto;
  background: none;
  border: none;
  padding: 0;
  color: var(--ember-soft);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
}

.link-btn:hover { text-decoration: underline; }

.foot-row {
  display: flex;
  gap: 20px;
}

.foot-row .link-btn { margin-left: 0; }

@media (max-width: 520px) {
  .avatar-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
