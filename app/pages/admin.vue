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
  const currentIds = volumeGroups.value.flatMap(([, chs]) => chs.map((c: any) => c.id))
  return currentIds.some((id, i) => id !== (chaptersData.value as any[])[i]?.id)
})
const savingOrder = ref(false)
const saveOrder = async () => {
  savingOrder.value = true
  try {
    const ids = volumeGroups.value.flatMap(([, chs]) => chs.map((c: any) => c.id))
    await $fetch('/api/admin/chapters/reorder', {
      method: 'PUT',
      body: { ids },
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
  about_title: '',
  about_text: '',
  error_404_sub: '',
  update_schedule: '',
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
const { data: commentLogs, refresh: refreshLogs } = await useFetch('/api/admin/comments')

const activeTab = ref<'upload' | 'chapters' | 'profile' | 'settings' | 'stats' | 'comments'>('upload')
const appHeader = ref()
const switchTab = (tab: typeof activeTab.value) => {
  activeTab.value = tab
  appHeader.value?.close()
}

useHead({ title: 'Админ · Странствующая Таверна' })
</script>

<template>
  <div class="admin-wrap">
    <div class="admin-layout">

      <!-- ШАПКА (только мобильная) -->
      <div class="admin-header-wrap">
      <AppHeader ref="appHeader" burger-left>
        <template #menu>
          <button class="adm-menu-link" :class="{ active: activeTab === 'upload' }" @click="switchTab('upload')">Добавить главу</button>
          <button class="adm-menu-link" :class="{ active: activeTab === 'chapters' }" @click="switchTab('chapters')">Список глав</button>
          <button class="adm-menu-link" :class="{ active: activeTab === 'settings' }" @click="switchTab('settings')">Настройки сайта</button>
          <button class="adm-menu-link" :class="{ active: activeTab === 'stats' }" @click="switchTab('stats')">Статистика</button>
          <button class="adm-menu-link" :class="{ active: activeTab === 'comments' }" @click="switchTab('comments')">Комментарии</button>
          <button class="adm-menu-link adm-logout" @click="auth.logout().then(() => navigateTo('/login'))">Выйти</button>
        </template>
      </AppHeader>
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

          <h3 class="stats-sub">Главы по просмотрам</h3>
          <div class="stats-table">
            <div v-for="ch in stats?.topChapters" :key="ch.id" class="stats-row">
              <span class="stats-id">{{ ch.id }}</span>
              <span class="stats-title">{{ ch.title }}</span>
              <span class="stats-views">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 2C3 2 1 5.5 1 5.5S3 9 5.5 9 10 5.5 10 5.5 8 2 5.5 2z" stroke="currentColor" stroke-width="1"/><circle cx="5.5" cy="5.5" r="1.5" fill="currentColor"/></svg>
                {{ ch.views?.toLocaleString('ru') }}
              </span>
              <span class="stats-dl">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v7M2 6l3.5 3.5L9 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ ch.downloads?.toLocaleString('ru') }}
              </span>
            </div>
            <div v-if="!stats?.topChapters?.length" class="empty-hint">Нет данных</div>
          </div>

        </section>

        <!-- Комментарии -->
        <section v-if="activeTab === 'comments'" class="card card--fill">
          <div class="logs-header">
            <h2 style="margin:0">Последние комментарии</h2>
            <button class="logs-refresh" @click="refreshLogs">↻ Обновить</button>
          </div>
          <div class="logs-list">
            <div v-for="c in commentLogs" :key="c.id" class="log-item">
              <div class="log-meta">
                <span class="log-time">{{ c.createdAt?.slice(0, 16).replace('T', ' ') }}</span>
                <span v-if="c.isSpoiler" class="log-spoiler">спойлер</span>
                <NuxtLink v-if="c.chapterId" :href="`/chapter/${c.chapterId.replace('.', '-')}/comments`" class="log-link" target="_blank">гл. {{ c.chapterId }} ↗</NuxtLink>
                <NuxtLink v-else href="/" class="log-link" target="_blank">отзыв о сайте ↗</NuxtLink>
              </div>
              <div class="log-body">{{ c.body }}</div>
            </div>
            <div v-if="!commentLogs?.length" class="empty-hint">Комментариев пока нет</div>
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
            <label>Страница «О проекте» — заголовок</label>
            <input v-model="form.about_title" type="text" placeholder="О проекте" />
          </div>
          <div class="field-row">
            <label>Страница «О проекте» — текст</label>
            <textarea v-model="form.about_text" rows="8" placeholder="Расскажите о проекте, переводчиках, истории..." />
          </div>
          <div class="field-row">
            <label>Ссылка Telegram</label>
            <input v-model="form.telegram_url" type="url">
          </div>
          <div class="field-row">
            <label>Ссылка поддержки</label>
            <input v-model="form.support_url" type="url">
          </div>
          <div class="field-row">
            <label>Текст страницы 404</label>
            <input v-model="form.error_404_sub" type="text" placeholder="Козёл добрался до этой страницы раньше тебя.">
          </div>
          <div class="field-row">
            <label>Глав в неделю</label>
            <input v-model="form.update_schedule" type="text" placeholder="2–3">
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
          <button class="sb-tab" :class="{ active: activeTab === 'comments' }" @click="activeTab = 'comments'">
            <span class="sb-icon">💬</span>
            Комментарии
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
  gap: 1px;
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid rgba(241, 230, 210, .07);
  border-radius: 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(214, 136, 62, .3) transparent;
}

.stats-table::-webkit-scrollbar {
  width: 4px;
}

.stats-table::-webkit-scrollbar-track {
  background: transparent;
}

.stats-table::-webkit-scrollbar-thumb {
  background: rgba(214, 136, 62, .3);
  border-radius: 4px;
}

.stats-table::-webkit-scrollbar-thumb:hover {
  background: rgba(214, 136, 62, .6);
}

.stats-row {
  display: grid;
  grid-template-columns: 48px 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
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
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--parchment);
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.stats-views svg,
.stats-dl svg {
  opacity: .5;
  flex-shrink: 0;
}

.card--fill {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 80px);
}

.card--fill .logs-header {
  flex-shrink: 0;
}

.card--fill .logs-list {
  flex: 1;
  max-height: none;
}

.logs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 12px;
}

.logs-refresh {
  background: none;
  border: 1px solid rgba(241, 230, 210, .15);
  border-radius: 6px;
  color: var(--parchment-2);
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
  font-family: var(--font-body);
  transition: border-color .15s;
}

.logs-refresh:hover {
  border-color: var(--ember-soft);
}

.logs-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid rgba(241, 230, 210, .07);
  border-radius: 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(214, 136, 62, .3) transparent;
}

.logs-list::-webkit-scrollbar {
  width: 4px;
}

.logs-list::-webkit-scrollbar-track {
  background: transparent;
}

.logs-list::-webkit-scrollbar-thumb {
  background: rgba(214, 136, 62, .3);
  border-radius: 4px;
}

.logs-list::-webkit-scrollbar-thumb:hover {
  background: rgba(214, 136, 62, .6);
}

.log-item {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-bottom: 1px solid rgba(241, 230, 210, .05);
}

.log-item:last-child {
  border-bottom: none;
}

.log-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-time {
  font-size: 11px;
  color: var(--ink-soft);
}

.log-spoiler {
  font-size: 11px;
  color: var(--ember-soft);
  font-style: italic;
}

.log-body {
  font-size: 12.5px;
  color: var(--parchment-2);
  opacity: .85;
  line-height: 1.5;
  word-break: break-word;
}

.log-link {
  font-size: 11px;
  color: var(--ember-soft);
  text-decoration: underline;
  text-underline-offset: 2px;
  margin-left: auto;
}

.log-link:hover {
  color: var(--ember);
}

.admin-header-wrap {
  display: none;
}

@media (max-width: 640px) {
  .admin-header-wrap {
    display: block;
  }
}

.adm-menu-link {
  display: block;
  width: 100%;
  padding: 16px 24px;
  font-size: 15px;
  font-family: var(--font-body);
  color: var(--parchment-2);
  text-decoration: none;
  background: none;
  border: none;
  border-bottom: 1px solid rgba(241, 230, 210, .06);
  text-align: left;
  cursor: pointer;
  transition: color .15s, background .15s;
}

.adm-menu-link:last-child { border-bottom: none; }

.adm-menu-link:hover,
.adm-menu-link.active {
  color: var(--ember-soft);
  background: rgba(241, 230, 210, .04);
}

.adm-logout { opacity: .6; }

@media (max-width: 640px) {
  .admin-layout {
    flex-direction: column;
    padding-top: 56px;
  }

  .admin-sidebar {
    display: none;
  }

  .admin-content {
    padding: 16px;
  }

  .card {
    padding: 20px 16px;
  }

  .card--fill {
    height: calc(100vh - 56px - 32px);
  }
}
</style>
