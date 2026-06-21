<script setup lang="ts">
const auth = useAuthStore()

onMounted(async () => {
  await auth.fetchMe()
  if (!auth.isAdmin) navigateTo('/login')
})

const { data: settings, refresh: refreshSettings } = await useFetch('/api/settings')

// --- Список глав ---
const { data: chaptersData, refresh: refreshChapters } = await useFetch('/api/chapters')
const chapterList = ref<any[]>([])
watch(chaptersData, (v) => { if (v) chapterList.value = [...v] }, { immediate: true })

const volumeGroups = computed(() => {
  const map = new Map<number, any[]>()
  for (const ch of chapterList.value) {
    if (!map.has(ch.volume)) map.set(ch.volume, [])
    map.get(ch.volume)!.push(ch)
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0])
})

const openVolumes = ref(new Set<number>())
watch(chapterList, (list) => {
  openVolumes.value = new Set(list.map(c => c.volume))
}, { immediate: true })
const toggleVolume = (vol: number) => {
  const s = new Set(openVolumes.value)
  s.has(vol) ? s.delete(vol) : s.add(vol)
  openVolumes.value = s
}

// Drag-and-drop
const dragSrcId = ref<string | null>(null)
const dragSrcVol = ref<number | null>(null)
const dragOverId = ref<string | null>(null)

const onDragStart = (e: DragEvent, ch: any) => {
  dragSrcId.value = ch.id
  dragSrcVol.value = ch.volume
  e.dataTransfer!.effectAllowed = 'move'
}
const onDragOver = (e: DragEvent, ch: any) => {
  if(ch.volume !== dragSrcVol.value || ch.id === dragSrcId.value){return}
  e.preventDefault()
  dragOverId.value = ch.id
}
const onDrop = (ch: any) => {
  if(!dragSrcId.value || ch.id === dragSrcId.value || ch.volume !== dragSrcVol.value){return}
  const arr = [...chapterList.value]
  const from = arr.findIndex(c => c.id === dragSrcId.value)
  const to = arr.findIndex(c => c.id === ch.id)
  arr.splice(to, 0, arr.splice(from, 1)[0])
  chapterList.value = arr
}
const onDragEnd = () => {
  dragSrcId.value = null
  dragSrcVol.value = null
  dragOverId.value = null
}

const orderChanged = computed(() => {
  if (!chaptersData.value) return false
  return chapterList.value.some((c, i) => c.id !== (chaptersData.value as any[])[i]?.id)
})
const savingOrder = ref(false)
const saveOrder = async () => {
  savingOrder.value = true
  try {
    await $fetch('/api/admin/chapters/reorder', {
      method: 'PUT',
      body: { ids: chapterList.value.map(c => c.id) },
    })
    await refreshChapters()
  } finally {
    savingOrder.value = false
  }
}

const deletingId = ref<string | null>(null)
const deleteChapter = async (id: string) => {
  if(!confirm(`Удалить главу ${id}? Это действие нельзя отменить.`)){return}
  deletingId.value = id
  try {
    await $fetch(`/api/admin/chapters/${id}`, { method: 'DELETE' })
    await refreshChapters()
  } finally {
    deletingId.value = null
  }
}

// --- Профиль ---
const { data: profile, refresh: refreshProfile } = await useFetch('/api/admin/profile')
const displayName = ref('')
const profileEmail = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const avatarFile = ref<File | null>(null)
const avatarPreview = ref<string | null>(null)
const savingProfile = ref(false)
const profileSaved = ref(false)
const profileError = ref('')

watch(profile, (p) => {
  if(p){
    displayName.value = p.displayName || ''
    profileEmail.value = p.email || ''
  }
}, { immediate: true })

const onAvatarFile = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  avatarFile.value = file
  if(file) avatarPreview.value = URL.createObjectURL(file)
}

const saveProfile = async () => {
  profileError.value = ''
  if(newPassword.value && newPassword.value !== confirmPassword.value){
    profileError.value = 'Пароли не совпадают'
    return
  }
  savingProfile.value = true
  try {
    const fd = new FormData()
    fd.append('displayName', displayName.value)
    if(profileEmail.value) fd.append('email', profileEmail.value)
    if(newPassword.value) fd.append('newPassword', newPassword.value)
    if(avatarFile.value) fd.append('avatar', avatarFile.value)
    await $fetch('/api/admin/profile', { method: 'PUT', body: fd })
    newPassword.value = ''
    confirmPassword.value = ''
    profileSaved.value = true
    setTimeout(() => { profileSaved.value = false }, 2000)
    await refreshProfile()
  } catch(e: any) {
    profileError.value = e?.data?.message || 'Ошибка сохранения'
  } finally {
    savingProfile.value = false
  }
}

const currentAvatar = computed(() => avatarPreview.value || profile.value?.avatarUrl || null)

// --- Пользователи ---
const newUserEmail = ref('')
const newUserPassword = ref('')
const creatingUser = ref(false)
const userCreated = ref(false)
const userError = ref('')

const createUser = async () => {
  userError.value = ''
  if(!newUserEmail.value || !newUserPassword.value){ userError.value = 'Заполни все поля'; return }
  creatingUser.value = true
  try {
    await $fetch('/api/admin/users', { method: 'POST', body: { email: newUserEmail.value, password: newUserPassword.value, role: 'admin' } })
    newUserEmail.value = ''
    newUserPassword.value = ''
    userCreated.value = true
    setTimeout(() => { userCreated.value = false }, 3000)
  } catch(e: any) {
    userError.value = e?.data?.message || 'Ошибка создания'
  } finally {
    creatingUser.value = false
  }
}

// --- Настройки сайта ---
const form = reactive({
  hero_title: '',
  hero_subtitle: '',
  ledger_note: '',
  footer_text: '',
  telegram_url: '',
  support_url: '',
})
watch(settings, (s) => { if (s) Object.assign(form, s) }, { immediate: true })

const savingSettings = ref(false)
const settingsSaved = ref(false)

const saveSettings = async () => {
  savingSettings.value = true
  try {
    await $fetch('/api/admin/settings', { method: 'PUT', body: form })
    settingsSaved.value = true
    setTimeout(() => { settingsSaved.value = false }, 2000)
    await refreshSettings()
  } finally {
    savingSettings.value = false
  }
}

// --- Загрузка главы ---
const chapterId = ref('')
const chapterTitle = ref('')
const chapterVolume = ref('')
const chapterDate = ref(new Date().toISOString().slice(0, 10))
const epubFile = ref<File | null>(null)
const uploading = ref(false)
const uploadResult = ref('')

const onFile = (e: Event) => {
  const input = e.target as HTMLInputElement
  epubFile.value = input.files?.[0] ?? null
}

const uploadChapter = async () => {
  if(!epubFile.value || !chapterId.value || !chapterTitle.value || !chapterVolume.value){
    uploadResult.value = 'Заполните все поля'
    return
  }
  uploading.value = true
  uploadResult.value = ''
  try {
    const fd = new FormData()
    fd.append('epub', epubFile.value)
    fd.append('id', chapterId.value)
    fd.append('title', chapterTitle.value)
    fd.append('volume', chapterVolume.value)
    fd.append('publishedAt', chapterDate.value)
    await $fetch('/api/admin/chapters', { method: 'POST', body: fd })
    uploadResult.value = `✓ Глава ${chapterId.value} загружена`
    chapterId.value = ''
    chapterTitle.value = ''
    chapterVolume.value = ''
    epubFile.value = null
  } catch (e: any) {
    uploadResult.value = `Ошибка: ${e.data?.message || e.message}`
  } finally {
    uploading.value = false
  }
}

// --- Статистика ---
const { data: stats } = await useFetch('/api/admin/stats')

const activeTab = ref<'upload' | 'chapters' | 'profile' | 'settings' | 'stats'>('upload')
const mobMenuOpen = ref(false)
const mobTabLabels = { upload: '＋ Добавить главу', chapters: '≡ Список глав', settings: '⚙ Настройки', profile: '○ Профиль', stats: '📊 Статистика' }
const mobTabLabel = computed(() => mobTabLabels[activeTab.value])

useHead({ title: 'Админ · Странствующая Таверна' })
</script>

<template>
  <div class="admin-wrap">
    <div class="admin-layout">

      <!-- МОБИЛЬНАЯ ШАПКА -->
      <div class="mobile-header">
        <NuxtLink href="/" class="mob-back">← Сайт</NuxtLink>
        <div class="mob-dropdown" :class="{ open: mobMenuOpen }">
          <button class="mob-dropdown-btn" @click="mobMenuOpen = !mobMenuOpen">
            {{ mobTabLabel }}
            <span class="mob-chev">▾</span>
          </button>
          <div class="mob-dropdown-list" @click="mobMenuOpen = false">
            <button class="mob-option" :class="{ active: activeTab === 'upload' }" @click="activeTab = 'upload'">Добавить главу</button>
            <button class="mob-option" :class="{ active: activeTab === 'chapters' }" @click="activeTab = 'chapters'">Список глав</button>
            <button class="mob-option" :class="{ active: activeTab === 'settings' }" @click="activeTab = 'settings'">Настройки</button>
            <button class="mob-option" :class="{ active: activeTab === 'profile' }" @click="activeTab = 'profile'">Профиль</button>
            <button class="mob-option" :class="{ active: activeTab === 'stats' }" @click="activeTab = 'stats'">Статистика</button>
          </div>
        </div>
        <button class="mob-logout" @click="auth.logout().then(() => navigateTo('/login'))">Выйти</button>
      </div>

      <!-- КОНТЕНТ -->
      <main class="admin-content">

        <!-- Добавить главу -->
        <section v-if="activeTab === 'upload'" class="card">
          <h2>Загрузить главу (.epub)</h2>
          <div class="field-row">
            <label>ID главы (том.номер)</label>
            <input v-model="chapterId" placeholder="4.21" type="text">
          </div>
          <div class="field-row">
            <label>Название</label>
            <input v-model="chapterTitle" placeholder="Глава 4.21 · В" type="text">
          </div>
          <div class="field-row">
            <label>Том</label>
            <input v-model="chapterVolume" placeholder="4" type="number" min="1">
          </div>
          <div class="field-row">
            <label>Дата публикации</label>
            <input v-model="chapterDate" type="date">
          </div>
          <div class="field-row">
            <label>Файл .epub</label>
            <input type="file" accept=".epub" @change="onFile">
          </div>
          <button class="btn-action" :disabled="uploading" @click="uploadChapter">
            {{ uploading ? 'Загружаем...' : 'Загрузить' }}
          </button>
          <p v-if="uploadResult" class="result-msg">{{ uploadResult }}</p>
        </section>

        <!-- Список и сортировка -->
        <section v-if="activeTab === 'chapters'" class="card">
          <div class="card-head">
            <h2>Главы ({{ chapterList.length }})</h2>
            <button v-if="orderChanged" class="btn-action btn-sm" :disabled="savingOrder" @click="saveOrder">
              {{ savingOrder ? 'Сохраняем...' : 'Сохранить порядок' }}
            </button>
          </div>
          <div v-if="chapterList.length === 0" class="empty-hint">Глав пока нет</div>
          <div v-for="[vol, chs] in volumeGroups" :key="vol" class="vol-block">
            <button class="vol-head" @click="toggleVolume(vol)">
              <span>Том {{ vol }} <span class="vol-count">{{ chs.length }} гл.</span></span>
              <span class="vol-chev" :class="{ open: openVolumes.has(vol) }">▸</span>
            </button>
            <div v-show="openVolumes.has(vol)" class="vol-body">
              <div
                v-for="ch in chs"
                :key="ch.id"
                class="chapter-row"
                :class="{ 'drag-over': dragOverId === ch.id, 'dragging': dragSrcId === ch.id }"
                draggable="true"
                @dragstart="onDragStart($event, ch)"
                @dragover="onDragOver($event, ch)"
                @drop="onDrop(ch)"
                @dragend="onDragEnd"
                @dragleave="dragOverId = null"
              >
                <span class="drag-handle" title="Перетащить">⠿</span>
                <span class="chapter-row-id">{{ ch.id }}</span>
                <span class="chapter-row-title">{{ ch.title }}</span>
                <button
                  class="btn-delete"
                  :disabled="deletingId === ch.id"
                  @click.stop="deleteChapter(ch.id)"
                >{{ deletingId === ch.id ? '...' : 'Удалить' }}</button>
              </div>
            </div>
          </div>
        </section>

        <!-- Профиль -->
        <section v-if="activeTab === 'profile'" class="card">
          <h2>Мой профиль</h2>
          <div class="profile-row">
            <div class="avatar-wrap">
              <img v-if="currentAvatar" :src="currentAvatar" class="avatar-img" alt="">
              <div v-else class="avatar-placeholder display">
                {{ (displayName || profile?.email || '?')[0].toUpperCase() }}
              </div>
              <label class="avatar-upload-btn" title="Загрузить фото">
                ✎
                <input type="file" accept="image/*" class="avatar-input" @change="onAvatarFile">
              </label>
            </div>
            <div class="profile-fields">
              <div class="field-row">
                <label>Отображаемое имя</label>
                <input v-model="displayName" type="text" placeholder="Как тебя звать в комментах">
              </div>
              <div class="field-row">
                <label>Email</label>
                <input v-model="profileEmail" type="email" placeholder="Email для входа">
              </div>
              <div class="field-row">
                <label>Новый пароль</label>
                <input v-model="newPassword" type="password" placeholder="Оставь пустым, чтобы не менять">
              </div>
              <div class="field-row" v-if="newPassword">
                <label>Повтори пароль</label>
                <input v-model="confirmPassword" type="password" placeholder="Повтори новый пароль">
              </div>
            </div>
          </div>
          <div v-if="profileError" class="form-error">{{ profileError }}</div>
          <button class="btn-action" :disabled="savingProfile" @click="saveProfile">
            {{ profileSaved ? '✓ Сохранено' : savingProfile ? 'Сохраняем...' : 'Сохранить профиль' }}
          </button>

          <hr class="section-divider">
          <h2>Добавить пользователя</h2>
          <div class="profile-fields" style="max-width:360px">
            <div class="field-row">
              <label>Email</label>
              <input v-model="newUserEmail" type="email" placeholder="Email нового пользователя">
            </div>
            <div class="field-row">
              <label>Пароль</label>
              <input v-model="newUserPassword" type="password" placeholder="Пароль (минимум 6 символов)">
            </div>
          </div>
          <div v-if="userError" class="form-error">{{ userError }}</div>
          <button class="btn-action" :disabled="creatingUser" @click="createUser" style="margin-top:12px">
            {{ userCreated ? '✓ Пользователь создан' : creatingUser ? 'Создаём...' : 'Создать администратора' }}
          </button>
        </section>

        <!-- Статистика -->
        <section v-if="activeTab === 'stats'" class="card">
          <h2>Статистика сайта</h2>
          <div class="stats-totals">
            <div class="stat-card">
              <div class="stat-value">{{ stats?.totalViews?.toLocaleString('ru') ?? 0 }}</div>
              <div class="stat-label">Просмотров глав</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ stats?.totalDownloads?.toLocaleString('ru') ?? 0 }}</div>
              <div class="stat-label">Скачиваний epub</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ stats?.totalComments?.toLocaleString('ru') ?? 0 }}</div>
              <div class="stat-label">Комментариев</div>
            </div>
          </div>

          <h3 class="stats-sub">Топ-10 глав по просмотрам</h3>
          <div class="stats-table">
            <div v-for="ch in stats?.topChapters" :key="ch.id" class="stats-row">
              <span class="stats-id">{{ ch.id }}</span>
              <span class="stats-title">{{ ch.title }}</span>
              <span class="stats-views">👁 {{ ch.views?.toLocaleString('ru') }}</span>
              <span class="stats-dl">⭳ {{ ch.downloads?.toLocaleString('ru') }}</span>
            </div>
            <div v-if="!stats?.topChapters?.length" class="empty-hint">Нет данных</div>
          </div>
        </section>

        <!-- Настройки сайта -->
        <section v-if="activeTab === 'settings'" class="card">
          <h2>Настройки сайта</h2>
          <div class="field-row">
            <label>Заголовок hero</label>
            <input v-model="form.hero_title" type="text">
          </div>
          <div class="field-row">
            <label>Подзаголовок hero</label>
            <textarea v-model="form.hero_subtitle" rows="3" />
          </div>
          <div class="field-row">
            <label>Текст под оглавлением</label>
            <input v-model="form.ledger_note" type="text">
          </div>
          <div class="field-row">
            <label>Текст футера</label>
            <textarea v-model="form.footer_text" rows="3" />
          </div>
          <div class="field-row">
            <label>Ссылка Telegram</label>
            <input v-model="form.telegram_url" type="url">
          </div>
          <div class="field-row">
            <label>Ссылка поддержки</label>
            <input v-model="form.support_url" type="url">
          </div>
          <button class="btn-action" :disabled="savingSettings" @click="saveSettings">
            {{ settingsSaved ? '✓ Сохранено' : savingSettings ? 'Сохраняем...' : 'Сохранить' }}
          </button>
        </section>
      </main>

      <!-- САЙДБАР -->
      <aside class="admin-sidebar">
        <div class="sb-profile" @click="activeTab = 'profile'">
          <img v-if="currentAvatar" :src="currentAvatar" class="sb-avatar" alt="">
          <div v-else class="sb-avatar sb-avatar--text display">
            {{ (displayName || profile?.email || '?')[0].toUpperCase() }}
          </div>
          <span class="sb-name">{{ displayName || profile?.email?.split('@')[0] }}</span>
        </div>

        <nav class="sb-nav">
          <button class="sb-tab" :class="{ active: activeTab === 'upload' }" @click="activeTab = 'upload'">
            <span class="sb-icon">＋</span>
            Добавить главу
          </button>
          <button class="sb-tab" :class="{ active: activeTab === 'chapters' }" @click="activeTab = 'chapters'">
            <span class="sb-icon">≡</span>
            Список глав
          </button>
          <button class="sb-tab" :class="{ active: activeTab === 'settings' }" @click="activeTab = 'settings'">
            <span class="sb-icon">⚙</span>
            Настройки сайта
          </button>
          <button class="sb-tab" :class="{ active: activeTab === 'stats' }" @click="activeTab = 'stats'">
            <span class="sb-icon">📊</span>
            Статистика
          </button>
        </nav>

        <div class="sb-bottom">
          <NuxtLink href="/" class="sb-link">← На сайт</NuxtLink>
          <button class="sb-link" @click="auth.logout().then(() => navigateTo('/login'))">Выйти</button>
        </div>
      </aside>

    </div>
  </div>
</template>

<style scoped>
.admin-wrap {
  min-height: 100vh;
  background: var(--bg-dark);
  color: var(--parchment);
  font-family: var(--font-body);
}

.admin-layout {
  display: flex;
  min-height: 100vh;
}

.admin-content {
  flex: 1;
  padding: 40px 32px;
  min-width: 0;
}

.admin-sidebar {
  width: 200px;
  flex: 0 0 200px;
  background: rgba(0, 0, 0, .25);
  border-left: 1px solid rgba(241, 230, 210, .08);
  display: flex;
  flex-direction: column;
  padding: 28px 0 24px;
  position: sticky;
  top: 0;
  height: 100vh;
}

/* Профиль в сайдбаре */
.sb-profile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0 16px 24px;
  border-bottom: 1px solid rgba(241, 230, 210, .08);
  cursor: pointer;
}

.sb-profile:hover .sb-name {
  color: var(--ember-soft);
}

.sb-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(241, 230, 210, .15);
}

.sb-avatar--text {
  background: linear-gradient(135deg, var(--ember-soft), var(--moss));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  color: var(--bg-dark);
}

.sb-name {
  font-size: 12px;
  color: var(--parchment-2);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  transition: color .15s;
}

/* Навигация */
.sb-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px 8px 0;
}

.sb-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  background: none;
  color: var(--parchment-2);
  font-family: var(--font-body);
  font-size: 13px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  transition: background .15s, color .15s;
  width: 100%;
}

.sb-tab:hover {
  background: rgba(241, 230, 210, .06);
  color: var(--parchment);
}

.sb-tab.active {
  background: rgba(214, 136, 62, .15);
  color: var(--ember-soft);
}

.sb-icon {
  font-size: 15px;
  flex: 0 0 auto;
  width: 18px;
  text-align: center;
}

/* Нижние ссылки */
.sb-bottom {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 8px 0;
  border-top: 1px solid rgba(241, 230, 210, .08);
}

.sb-link {
  display: block;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--ink-soft);
  background: none;
  border: none;
  font-family: var(--font-body);
  cursor: pointer;
  text-align: left;
  border-radius: var(--radius-sm);
  transition: color .15s;
  text-decoration: none;
}

.sb-link:hover {
  color: var(--parchment-2);
}

/* Контент */
.card {
  background: var(--bg-dark-2);
  border-radius: var(--radius-md);
  border: 1px solid rgba(241, 230, 210, .1);
  padding: 28px;
  max-width: 680px;
}

.card h2 {
  font-size: 17px;
  margin: 0 0 22px;
  font-weight: 600;
  color: var(--parchment-2);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.card-head h2 {
  margin: 0;
}

.empty-hint {
  font-size: 13px;
  color: var(--ink-soft);
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.field-row label {
  font-size: 12px;
  color: var(--ink-soft);
  letter-spacing: .04em;
  text-transform: uppercase;
}

.field-row input,
.field-row textarea {
  background: rgba(241, 230, 210, .05);
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-md);
  color: var(--parchment);
  padding: 9px 12px;
  font-family: var(--font-body);
  font-size: 13.5px;
  width: 100%;
}

.field-row textarea {
  resize: vertical;
}

.field-row input:focus-visible,
.field-row textarea:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

.field-row input[type="file"] {
  border: none;
  padding: 0;
  color: var(--parchment-2);
}

.btn-action {
  background: var(--ember);
  color: var(--bg-dark);
  border: none;
  padding: 10px 22px;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-action:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.btn-sm {
  padding: 7px 14px;
  font-size: 12px;
}

.result-msg {
  font-size: 13px;
  color: var(--ember-soft);
  margin-top: 10px;
}

/* Профиль */
.profile-row {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  margin-bottom: 20px;
}

.avatar-wrap {
  position: relative;
  flex: 0 0 auto;
}

.avatar-img {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(241, 230, 210, .15);
}

.avatar-placeholder {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--ember-soft), var(--moss));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 600;
  color: var(--bg-dark);
}

.avatar-upload-btn {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--ember);
  color: var(--bg-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
  border: 2px solid var(--bg-dark-2);
}

.avatar-input {
  display: none;
}

.profile-fields {
  flex: 1;
  min-width: 0;
}

.form-error {
  font-size: 13px;
  color: #c66;
  margin-bottom: 8px;
}

.section-divider {
  border: none;
  border-top: 1px solid rgba(43,30,22,.12);
  margin: 28px 0;
}

/* Список глав */
.vol-block {
  border-bottom: 1px solid rgba(241, 230, 210, .08);
}

.vol-block:last-child {
  border-bottom: none;
}

.vol-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px;
  background: none;
  border: none;
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.vol-head:hover {
  color: var(--ember-soft);
}

.vol-count {
  font-weight: 400;
  color: var(--ink-soft);
  margin-left: 8px;
  font-size: 12px;
}

.vol-chev {
  font-size: 11px;
  color: var(--ink-soft);
  transition: transform .2s;
}

.vol-chev.open {
  transform: rotate(90deg);
}

.vol-body {
  padding-bottom: 6px;
}

.chapter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-radius: var(--radius-sm);
  cursor: grab;
  user-select: none;
  transition: background .1s;
}

.chapter-row:hover {
  background: rgba(241, 230, 210, .04);
}

.chapter-row.drag-over {
  background: rgba(214, 136, 62, .12);
  outline: 1px solid rgba(214, 136, 62, .4);
}

.chapter-row.dragging {
  opacity: .4;
}

.drag-handle {
  color: var(--ink-soft);
  font-size: 14px;
  cursor: grab;
  flex: 0 0 auto;
}

.chapter-row-id {
  font-size: 12px;
  color: var(--ember-soft);
  font-family: var(--font-display);
  white-space: nowrap;
  flex: 0 0 auto;
}

.chapter-row-title {
  font-size: 13px;
  color: var(--parchment-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.btn-delete {
  background: none;
  border: 1px solid rgba(200, 80, 80, .3);
  color: #c66;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex: 0 0 auto;
}

.btn-delete:disabled {
  opacity: .4;
  cursor: not-allowed;
}

.btn-delete:not(:disabled):hover {
  border-color: #c66;
  background: rgba(200, 80, 80, .1);
}

/* Статистика */
.stats-totals {
  display: flex;
  gap: 16px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.stat-card {
  flex: 1;
  min-width: 120px;
  background: rgba(241, 230, 210, .05);
  border: 1px solid rgba(241, 230, 210, .1);
  border-radius: var(--radius-md);
  padding: 16px 20px;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--ember-soft);
  font-family: var(--font-display);
}

.stat-label {
  font-size: 12px;
  color: var(--ink-soft);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.stats-sub {
  font-size: 13px;
  font-weight: 600;
  color: var(--parchment-2);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.stats-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stats-row {
  display: grid;
  grid-template-columns: 48px 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 8px 4px;
  border-bottom: 1px solid rgba(241, 230, 210, .06);
  font-size: 13px;
}

.stats-id {
  color: var(--ember-soft);
  font-family: var(--font-display);
  font-size: 12px;
}

.stats-title {
  color: var(--parchment-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats-views,
.stats-dl {
  color: var(--ink-soft);
  font-size: 12px;
  white-space: nowrap;
}

.mobile-header {
  display: none;
}

@media (max-width: 640px) {
  .admin-layout {
    flex-direction: column;
  }

  .admin-sidebar {
    display: none;
  }

  .admin-content {
    padding: 16px;
  }

  .mobile-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(241, 230, 210, .08);
    flex-shrink: 0;
    background: rgba(0, 0, 0, .2);
  }

  .mob-back {
    font-size: 12px;
    color: var(--parchment-2);
    white-space: nowrap;
    text-decoration: none;
  }

  .mob-dropdown {
    flex: 1;
    position: relative;
  }

  .mob-dropdown-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    background: rgba(241, 230, 210, .07);
    border: 1px solid rgba(241, 230, 210, .18);
    border-radius: var(--radius-sm);
    color: var(--parchment);
    font-family: var(--font-body);
    font-size: 13px;
    padding: 7px 10px;
    cursor: pointer;
    text-align: left;
  }

  .mob-chev {
    font-size: 11px;
    color: var(--ink-soft);
    transition: transform .2s;
  }

  .mob-dropdown.open .mob-chev {
    transform: rotate(180deg);
  }

  .mob-dropdown-list {
    display: none;
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--bg-dark-2);
    border: 1px solid rgba(241, 230, 210, .15);
    border-radius: var(--radius-sm);
    z-index: 100;
    overflow: hidden;
  }

  .mob-dropdown.open .mob-dropdown-list {
    display: block;
  }

  .mob-option {
    display: block;
    width: 100%;
    padding: 11px 14px;
    background: none;
    border: none;
    color: var(--parchment-2);
    font-family: var(--font-body);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    border-bottom: 1px solid rgba(241, 230, 210, .06);
  }

  .mob-option:last-child {
    border-bottom: none;
  }

  .mob-option:hover {
    background: rgba(241, 230, 210, .05);
    color: var(--parchment);
  }

  .mob-option.active {
    color: var(--ember-soft);
  }

  .mob-logout {
    background: none;
    border: none;
    color: var(--parchment-2);
    font-family: var(--font-body);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    padding: 0;
  }

  .card {
    padding: 20px 16px;
  }
}
</style>
