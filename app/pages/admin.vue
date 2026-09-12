<script setup lang="ts">
import { FRAME_FIT_DEFAULT, FRAME_FIT_MAX, FRAME_FIT_MIN } from '#shared/utils/avatarFrames'

// Чужих отсеивает middleware ещё на сервере: каркас панели не рендерится никому,
// кроме администратора.
definePageMeta({ middleware: 'admin' })

const auth = useAuthStore()

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
const knownVolumes = ref(new Set<number>())
watch(chapterList, (list) => {
  const vols = new Set(list.map(c => c.volume))
  const next = new Set(openVolumes.value)
  for (const vol of vols) {
    if (!knownVolumes.value.has(vol)) next.add(vol)
  }
  for (const vol of next) {
    if (!vols.has(vol)) next.delete(vol)
  }
  knownVolumes.value = vols
  openVolumes.value = next
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

const editingChapter = ref<{ id: string; title: string } | null>(null)

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

// --- Рамки для аватарок ---
type AdminFrame = { id: number; name: string; url: string; fit: number; inPool: boolean; isDefault: boolean; owners: number }
type FrameOwner = {
  id: number
  name: string
  avatarUrl: string | null
  wearing: number | null
  frames: { id: number; grantedAt: string }[]
}

/** Сторона картинки рамки. Вчетверо крупнее аватарки: у рамки мелкие детали по
 *  кругу, и на 256 пикселях от них остаётся каша. */
const FRAME_SIDE = 512

const { data: framesData, refresh: refreshFrames } =
  await useFetch<{ frames: AdminFrame[]; owners: FrameOwner[] }>('/api/admin/frames')

const frames = computed(() => framesData.value?.frames ?? [])
const frameOwners = computed(() => framesData.value?.owners ?? [])
const frameName = (id: number | null) => frames.value.find(f => f.id === id)?.name ?? '—'

const newFrame = reactive({ name: '', fit: FRAME_FIT_DEFAULT })
const newFrameFile = ref<File | null>(null)
const newFramePreview = ref<string | null>(null)
const frameFileInput = ref<HTMLInputElement | null>(null)
const savingFrame = ref(false)
const frameMsg = ref('')
const frameError = ref('')

const onFrameFile = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null
  newFrameFile.value = file
  newFramePreview.value = file ? URL.createObjectURL(file) : null
}

/**
 * Ужимает картинку рамки до 512×512 прямо в браузере — на сервере нативной
 * библиотеки для этого нет. webp выбран ради прозрачности: без неё рамка была
 * бы квадратом, накрывающим аватарку. Картинку вписываем целиком, не обрезая:
 * у рамки края — это и есть рамка.
 */
const toFrameImage = (file: File): Promise<Blob> => new Promise((resolve) => {
  const img = new Image()
  const url = URL.createObjectURL(file)

  img.onload = () => {
    URL.revokeObjectURL(url)
    const canvas = document.createElement('canvas')
    canvas.width = FRAME_SIDE
    canvas.height = FRAME_SIDE

    const ctx = canvas.getContext('2d')
    if (!ctx) return resolve(file)

    const scale = FRAME_SIDE / Math.max(img.width, img.height)
    const w = img.width * scale
    const h = img.height * scale
    ctx.drawImage(img, (FRAME_SIDE - w) / 2, (FRAME_SIDE - h) / 2, w, h)
    canvas.toBlob(blob => resolve(blob ?? file), 'image/webp', 0.9)
  }

  img.onerror = () => {
    URL.revokeObjectURL(url)
    resolve(file)
  }

  img.src = url
})

const createFrame = async () => {
  frameError.value = ''
  frameMsg.value = ''

  if (!newFrame.name.trim()) { frameError.value = 'Нужно название'; return }
  if (!newFrameFile.value) { frameError.value = 'Нужна картинка'; return }

  savingFrame.value = true
  try {
    const fd = new FormData()
    fd.append('name', newFrame.name.trim())
    fd.append('fit', String(newFrame.fit))
    fd.append('image', await toFrameImage(newFrameFile.value), 'frame.webp')

    await $fetch('/api/admin/frames', { method: 'POST', body: fd })

    newFrame.name = ''
    newFrame.fit = FRAME_FIT_DEFAULT
    newFrameFile.value = null
    newFramePreview.value = null
    if (frameFileInput.value) frameFileInput.value.value = ''
    frameMsg.value = 'Рамка добавлена'
    await refreshFrames()
  } catch (e: any) {
    frameError.value = e?.data?.message || 'Не сохранилось'
  } finally {
    savingFrame.value = false
  }
}

const defaultFrame = computed(() => frames.value.find(f => f.isDefault) ?? null)
const backfilling = ref(false)

/** Раздать рамку новичка тем, кто зарегистрировался до её появления. */
const backfillDefault = async () => {
  if (!confirm('Выдать рамку новичка всем, кто уже зарегистрирован? Надета она будет только на тех, кто ходит без рамки.')) return

  backfilling.value = true
  frameMsg.value = ''
  try {
    const res = await $fetch<{ message: string }>('/api/admin/frames/backfill', { method: 'POST' })
    frameMsg.value = res.message
    await refreshFrames()
  } catch (e: any) {
    frameError.value = e?.data?.message || 'Не вышло'
  } finally {
    backfilling.value = false
  }
}

const saveFrame = async (frame: AdminFrame, patch: { name?: string; fit?: number; inPool?: boolean; isDefault?: boolean }) => {
  frameError.value = ''
  const fd = new FormData()
  if (patch.name !== undefined) fd.append('name', patch.name)
  if (patch.fit !== undefined) fd.append('fit', String(patch.fit))
  if (patch.inPool !== undefined) fd.append('inPool', patch.inPool ? '1' : '0')
  if (patch.isDefault !== undefined) fd.append('isDefault', patch.isDefault ? '1' : '0')

  try {
    await $fetch(`/api/admin/frames/${frame.id}`, { method: 'PUT', body: fd })
    await refreshFrames()
  } catch (e: any) {
    frameError.value = e?.data?.message || 'Не сохранилось'
  }
}

const removeFrame = async (frame: AdminFrame) => {
  const owned = frame.owners
    ? ` Её потеряют ${frame.owners} чел. — это отменит их награду.`
    : ''
  if (!confirm(`Удалить рамку «${frame.name}»?${owned}`)) return

  try {
    await $fetch(`/api/admin/frames/${frame.id}`, { method: 'DELETE' })
    await refreshFrames()
  } catch (e: any) {
    frameError.value = e?.data?.message || 'Не удалилось'
  }
}

// --- Выдача рамок ---
const userQuery = ref('')
const foundUsers = ref<{ id: number; name: string; email: string | null; avatarUrl: string | null }[]>([])
const grantTarget = ref<{ id: number; name: string; avatarUrl: string | null } | null>(null)
const grantFrameId = ref<number | 'random'>('random')
const granting = ref(false)
const grantMsg = ref('')

// Ищем не на каждую букву: поиск идёт в базу, а имя дописывают быстрее, чем
// приходит ответ.
let userSearchTimer: ReturnType<typeof setTimeout> | undefined
watch(userQuery, (q) => {
  clearTimeout(userSearchTimer)
  if (q.trim().length < 2) { foundUsers.value = []; return }

  userSearchTimer = setTimeout(async () => {
    foundUsers.value = await $fetch('/api/admin/users', { query: { q: q.trim() } }).catch(() => [])
  }, 300)
})

const pickUser = (u: { id: number; name: string; avatarUrl: string | null }) => {
  grantTarget.value = u
  userQuery.value = ''
  foundUsers.value = []
}

const sendGrant = async (userId: number, frameId: number | 'random', revoke = false) => {
  granting.value = true
  grantMsg.value = ''

  try {
    const res = await $fetch<{ message: string }>('/api/admin/frames/grant', {
      method: 'POST',
      body: { userId, frameId, revoke },
    })
    grantMsg.value = res.message
    await refreshFrames()
  } catch (e: any) {
    grantMsg.value = e?.data?.message || 'Не вышло'
  } finally {
    granting.value = false
  }
}

// --- Настройки сайта ---
const form = reactive({
  hero_title: '',
  hero_subtitle: '',
  hero_ticker: '',
  hero_ticker_on: '',
  ledger_note: '',
  footer_text: '',
  telegram_url: '',
  boosty_url: '',
  tribute_url: '',
  about_title: '',
  about_text: '',
  error_404_sub: '',
  update_schedule: '',
  game_max_volume: '',
  game_cta_title: '',
  game_cta_text: '',
  tg_cta_title: '',
  tg_cta_text: '',
})
watch(settings, (s) => { if (s) Object.assign(form, s) }, { immediate: true })

/*
  Настройки хранятся строками, а галочке нужно логическое значение — отсюда
  посредник. Пустая настройка считается включённой: если строка уже написана, а
  флажка в базе ещё нет, показать её правильнее, чем спрятать.
*/
const tickerOn = computed({
  get: () => form.hero_ticker_on !== '0',
  set: (v: boolean) => { form.hero_ticker_on = v ? '1' : '0' },
})

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
const chapterPublished = ref(true)
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
    fd.append('isPublished', chapterPublished.value ? '1' : '0')
    await $fetch('/api/admin/chapters', { method: 'POST', body: fd })
    uploadResult.value = `✓ Глава ${chapterId.value} загружена`
    chapterId.value = ''
    chapterTitle.value = ''
    chapterVolume.value = ''
    chapterPublished.value = true
    epubFile.value = null
  } catch (e: any) {
    uploadResult.value = `Ошибка: ${e.data?.message || e.message}`
  } finally {
    uploading.value = false
  }
}

// --- Уведомления в телеграм ---
const runtimeConfig = useRuntimeConfig()
const { data: notifyData, refresh: refreshNotify } = await useFetch('/api/admin/notify')
const selectedNotifyIds = ref<string[]>([])
const sendingNotify = ref(false)
const notifyResult = ref('')
const notifyError = ref('')

const pendingChapters = computed(() => notifyData.value?.chapters ?? [])

// После загрузки и после отправки список сам отмечает то, про что ещё не писали.
watch(notifyData, () => {
  selectedNotifyIds.value = pendingChapters.value.map(c => c.id)
}, { immediate: true })

const notifyPreview = computed(() => {
  const byId = new Map((notifyData.value?.chapters ?? []).map(c => [c.id, c]))
  const picked = selectedNotifyIds.value.map(id => byId.get(id)).filter(Boolean) as { id: string; title: string }[]
  return buildChapterNotification(picked, runtimeConfig.public.siteUrl)
})

const formatNotifyDate = (iso?: string | null) => iso ? iso.slice(0, 16).replace('T', ' ') : '—'

const sendNotify = async () => {
  notifyError.value = ''
  notifyResult.value = ''
  sendingNotify.value = true
  try {
    const res = await $fetch('/api/admin/notify', {
      method: 'POST',
      body: { chapterIds: selectedNotifyIds.value },
    })
    notifyResult.value = `✓ Отправлено в телеграм: ${res.count} гл.`
    await refreshNotify()
  } catch (e: any) {
    notifyError.value = e?.data?.message || 'Не удалось отправить'
  } finally {
    sendingNotify.value = false
  }
}

// --- Статистика ---
const { data: stats } = await useFetch('/api/admin/stats')
type StatsSortKey = 'order' | 'date' | 'views' | 'downloads'
const statsSort = ref<{ key: StatsSortKey; dir: 'asc' | 'desc' }>({ key: 'views', dir: 'desc' })

const toggleStatsSort = (key: StatsSortKey) => {
  // Повторный клик по той же колонке переворачивает порядок. У новой колонки
  // направление по умолчанию своё: главы читают сверху вниз, числа — от большего.
  statsSort.value = statsSort.value.key === key
    ? { key, dir: statsSort.value.dir === 'desc' ? 'asc' : 'desc' }
    : { key, dir: key === 'views' || key === 'downloads' ? 'desc' : 'asc' }
}

const statsSortClass = (key: StatsSortKey) => ({
  active: statsSort.value.key === key,
  asc: statsSort.value.key === key && statsSort.value.dir === 'asc',
})

const statsQuery = ref('')

const visibleStats = computed(() => {
  const q = statsQuery.value.trim().toLowerCase()
  const rows = (stats.value?.topChapters ?? []).filter(ch =>
    !q || ch.id.toLowerCase().includes(q) || ch.title.toLowerCase().includes(q))
  const { key, dir } = statsSort.value
  const sign = dir === 'asc' ? 1 : -1
  return rows.sort((a, b) => {
    // «По номеру» — это порядок глав на сайте, тот самый, что задан перетаскиванием.
    if (key === 'order') return (a.sortOrder - b.sortOrder) * sign
    if (key === 'date') return (a.publishedAt ?? '').localeCompare(b.publishedAt ?? '') * sign
    return ((a[key] ?? 0) - (b[key] ?? 0)) * sign
  })
})

const formatStatsDate = (iso?: string | null) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—'

const { data: commentLogs, refresh: refreshLogs } = await useFetch('/api/admin/comments')

const activeTab = ref<'upload' | 'chapters' | 'profile' | 'settings' | 'notify' | 'stats' | 'comments' | 'frames'>('upload')
const appHeader = ref()
const switchTab = (tab: typeof activeTab.value) => {
  activeTab.value = tab
  appHeader.value?.close()
}

/**
 * Время из базы — UTC без зоны ('YYYY-MM-DD HH:MM:SS'). Хозяйка сайта живёт по
 * Москве, и «13:33» вместо «16:33» сбивало бы с толку.
 */
const fmtMsk = (iso?: string | null) => {
  if (!iso) return ''
  const date = new Date(iso.replace(' ', 'T') + 'Z')
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

useHead({
  title: 'Админ · Странствующая Таверна',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <div class="admin-wrap" data-clarity-mask="true">
    <div class="admin-layout">

      <!-- ШАПКА (только мобильная) -->
      <div class="admin-header-wrap">
      <AppHeader ref="appHeader" burger-left>
        <template #menu>
          <button class="adm-menu-link" :class="{ active: activeTab === 'upload' }" @click="switchTab('upload')">Добавить главу</button>
          <button class="adm-menu-link" :class="{ active: activeTab === 'chapters' }" @click="switchTab('chapters')">Список глав</button>
          <button class="adm-menu-link" :class="{ active: activeTab === 'settings' }" @click="switchTab('settings')">Настройки сайта</button>
          <button class="adm-menu-link" :class="{ active: activeTab === 'notify' }" @click="switchTab('notify')">Уведомления</button>
          <button class="adm-menu-link" :class="{ active: activeTab === 'stats' }" @click="switchTab('stats')">Статистика</button>
          <button class="adm-menu-link" :class="{ active: activeTab === 'comments' }" @click="switchTab('comments')">Комментарии</button>
          <button class="adm-menu-link" :class="{ active: activeTab === 'frames' }" @click="switchTab('frames')">Рамки</button>
          <NuxtLink href="/game" class="adm-menu-link">Игра</NuxtLink>
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
          <label class="checkbox-row">
            <input v-model="chapterPublished" type="checkbox">
            <span>Опубликовать сразу (видно всем читателям)</span>
          </label>
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
                <span v-if="!ch.isPublished" class="chapter-row-draft">черновик</span>
                <button
                  class="btn-action btn-sm"
                  @click.stop="editingChapter = { id: ch.id, title: ch.title }"
                >Редактировать</button>
                <button
                  class="btn-delete"
                  title="Удалить"
                  :disabled="deletingId === ch.id"
                  @click.stop="deleteChapter(ch.id)"
                >
                  <span v-if="deletingId === ch.id">...</span>
                  <svg v-else width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3.5h9M5 3.5V2.3a.8.8 0 0 1 .8-.8h1.4a.8.8 0 0 1 .8.8v1.2M3.5 3.5v7.2a.8.8 0 0 0 .8.8h4.4a.8.8 0 0 0 .8-.8V3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.3 6v3.5M7.7 6v3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        <ChapterEditModal
          v-if="editingChapter"
          :chapter-id="editingChapter.id"
          :chapter-title="editingChapter.title"
          @close="editingChapter = null"
          @saved="editingChapter = null; refreshChapters()"
        />

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
        <section v-if="activeTab === 'stats'" class="card card--wide">
          <h2>Статистика сайта</h2>
          <div class="stats-totals">
            <div class="stat-card">
              <div class="stat-value">{{ stats?.totalViews?.toLocaleString('ru') ?? 0 }}</div>
              <div class="stat-label">Просмотров глав</div>
            </div>
            <div class="stat-card stat-card--today">
              <div class="stat-value">{{ stats?.viewsToday?.toLocaleString('ru') ?? 0 }}</div>
              <div class="stat-label">Просмотров сегодня</div>
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

          <!-- Читатели — строкой, а не пятой плиткой: на этом экране их уже
               четыре, и ещё одна ничего не прибавила бы к пониманию. -->
          <p class="readers-line">
            <span>Читателей <b>{{ stats?.readers?.total?.toLocaleString('ru') ?? 0 }}</b></span>
            <span v-if="stats?.readers?.week" class="readers-new">+{{ stats.readers.week }} за неделю</span>
            <span>Google {{ stats?.readers?.google ?? 0 }} · Telegram {{ stats?.readers?.telegram ?? 0 }}</span>
            <span>пишут или играют {{ stats?.readers?.active ?? 0 }}</span>
          </p>

          <h3 class="stats-sub">Игра «Кто из таверны»</h3>
          <div class="game-stats">
            <div class="game-stats-row game-stats-head">
              <span></span>
              <span>Сегодня</span>
              <span>За всё время</span>
            </div>
            <div class="game-stats-row">
              <span>Партий</span>
              <span>{{ (stats?.game?.today?.played ?? 0).toLocaleString('ru') }}</span>
              <span>{{ (stats?.game?.total?.played ?? 0).toLocaleString('ru') }}</span>
            </div>
            <div class="game-stats-row">
              <span>Угадано</span>
              <span>{{ (stats?.game?.today?.won ?? 0).toLocaleString('ru') }}</span>
              <span>{{ (stats?.game?.total?.won ?? 0).toLocaleString('ru') }}</span>
            </div>
            <div class="game-stats-row">
              <span>Попыток</span>
              <span>{{ (stats?.game?.today?.guesses ?? 0).toLocaleString('ru') }}</span>
              <span>{{ (stats?.game?.total?.guesses ?? 0).toLocaleString('ru') }}</span>
            </div>
          </div>

          <div class="stats-tablehead">
            <h3 class="stats-sub">Главы<span v-if="statsQuery" class="stats-found"> · найдено {{ visibleStats.length }}</span></h3>
            <input v-model="statsQuery" class="stats-search" type="search" placeholder="Номер или название">
          </div>
          <div class="stats-table">
            <div class="stats-row stats-head">
              <button class="stats-sort" :class="statsSortClass('order')" @click="toggleStatsSort('order')">Глава</button>
              <span></span>
              <button class="stats-sort stats-sort--date" :class="statsSortClass('date')" @click="toggleStatsSort('date')">Дата</button>
              <button class="stats-sort stats-sort--num" :class="statsSortClass('views')" @click="toggleStatsSort('views')">Просмотры</button>
              <button class="stats-sort stats-sort--num" :class="statsSortClass('downloads')" @click="toggleStatsSort('downloads')">Скачивания</button>
            </div>
            <div v-for="ch in visibleStats" :key="ch.id" class="stats-row">
              <span class="stats-id">{{ ch.id }}</span>
              <span class="stats-title">{{ ch.title }}</span>
              <span class="stats-date">{{ formatStatsDate(ch.publishedAt) }}</span>
              <span class="stats-views">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 2C3 2 1 5.5 1 5.5S3 9 5.5 9 10 5.5 10 5.5 8 2 5.5 2z" stroke="currentColor" stroke-width="1"/><circle cx="5.5" cy="5.5" r="1.5" fill="currentColor"/></svg>
                {{ ch.views?.toLocaleString('ru') }}
              </span>
              <span class="stats-dl">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v7M2 6l3.5 3.5L9 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ ch.downloads?.toLocaleString('ru') }}
              </span>
            </div>
            <div v-if="!visibleStats.length" class="empty-hint">
              {{ statsQuery ? 'Ничего не нашлось' : 'Нет данных' }}
            </div>
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
                <span class="log-time">{{ fmtMsk(c.createdAt) }}</span>
                <span v-if="c.isSpoiler" class="log-spoiler">спойлер</span>
                <NuxtLink v-if="c.chapterId" :href="`/chapter/${encodeURIComponent(slugifyChapterId(c.chapterId))}/comments`" class="log-link" target="_blank">гл. {{ c.chapterId }} ↗</NuxtLink>
                <NuxtLink v-else href="/" class="log-link" target="_blank">отзыв о сайте ↗</NuxtLink>
              </div>
              <div class="log-body">{{ c.body }}</div>
            </div>
            <div v-if="!commentLogs?.length" class="empty-hint">Комментариев пока нет</div>
          </div>
        </section>

        <!-- Рамки для аватарок -->
        <section v-if="activeTab === 'frames'" class="card card--wide">
          <h2>Рамки для аватарок</h2>

          <p class="frames-note">
            Рамка — картинка с прозрачной серединой. Достаётся за ивенты: выдать её можно
            здесь, а носить человек будет ту из выигранных, которую выберет сам в профиле.
          </p>

          <!-- Новая рамка -->
          <div class="frame-new">
            <UserAvatar
              class="frame-preview"
              :src="currentAvatar"
              :name="displayName"
              :frame="newFramePreview ? { id: 0, name: '', url: newFramePreview, fit: newFrame.fit } : null"
              :size="72"
              alt=""
            />

            <div class="frame-new-fields">
              <div class="field-row">
                <label>Название</label>
                <input v-model="newFrame.name" type="text" maxlength="40" placeholder="Костяной венок">
              </div>

              <div class="field-row">
                <label>Картинка (png или webp с прозрачностью)</label>
                <input ref="frameFileInput" type="file" accept="image/*" @change="onFrameFile">
              </div>

              <div class="field-row">
                <label>Посадка аватарки — {{ Math.round(newFrame.fit * 100) }}%</label>
                <input
                  v-model.number="newFrame.fit"
                  type="range"
                  :min="FRAME_FIT_MIN"
                  :max="FRAME_FIT_MAX"
                  step="0.01"
                >
              </div>

              <button class="btn-action" :disabled="savingFrame" @click="createFrame">
                {{ savingFrame ? 'Сохраняем...' : 'Добавить рамку' }}
              </button>
              <p v-if="frameMsg" class="result-msg">{{ frameMsg }}</p>
              <p v-if="frameError" class="err-msg">{{ frameError }}</p>
            </div>
          </div>

          <hr class="section-divider">

          <!-- Каталог -->
          <h3 class="frames-sub">Каталог ({{ frames.length }})</h3>
          <p v-if="!frames.length" class="empty-hint">Рамок пока нет</p>

          <div v-for="f in frames" :key="f.id" class="frame-row">
            <UserAvatar
              class="frame-preview"
              :src="currentAvatar"
              :name="displayName"
              :frame="f"
              :size="56"
              alt=""
            />

            <div class="frame-row-main">
              <input
                class="frame-row-name"
                :value="f.name"
                type="text"
                maxlength="40"
                @change="saveFrame(f, { name: ($event.target as HTMLInputElement).value })"
              >

              <div class="frame-row-line">
                <label class="frame-fit">
                  посадка {{ Math.round(f.fit * 100) }}%
                  <input
                    v-model.number="f.fit"
                    type="range"
                    :min="FRAME_FIT_MIN"
                    :max="FRAME_FIT_MAX"
                    step="0.01"
                    @change="saveFrame(f, { fit: f.fit })"
                  >
                </label>

                <label class="frame-pool">
                  <input
                    type="checkbox"
                    :checked="f.inPool"
                    @change="saveFrame(f, { inPool: ($event.target as HTMLInputElement).checked })"
                  >
                  <span>в раздаче</span>
                </label>

                <label class="frame-pool" title="Достаётся при регистрации и сразу надевается. Такая рамка одна на сайт.">
                  <input
                    type="checkbox"
                    :checked="f.isDefault"
                    @change="saveFrame(f, { isDefault: ($event.target as HTMLInputElement).checked })"
                  >
                  <span>новичкам</span>
                </label>

                <span class="frame-owners">у {{ f.owners }} чел.</span>
                <button class="frame-del" @click="removeFrame(f)">Удалить</button>
              </div>
            </div>
          </div>

          <div class="newcomer">
            <template v-if="defaultFrame">
              <UserAvatar
                class="frame-preview"
                :src="currentAvatar"
                :name="displayName"
                :frame="defaultFrame"
                :size="34"
                alt=""
              />
              <span class="newcomer-text">
                Новички получают «{{ defaultFrame.name }}» при регистрации и сразу в ней ходят.
              </span>
              <button class="btn-action btn-sm" :disabled="backfilling" @click="backfillDefault">
                {{ backfilling ? '...' : 'Выдать и тем, кто уже есть' }}
              </button>
            </template>
            <span v-else class="newcomer-text">
              Рамка новичка не выбрана — новые читатели приходят без рамки.
              Отметь «новичкам» у той, что должна доставаться всем.
            </span>
          </div>

          <hr class="section-divider">

          <!-- Выдача -->
          <h3 class="frames-sub">Выдать рамку</h3>

          <div class="field-row">
            <label>Кому</label>
            <input v-model="userQuery" type="text" placeholder="имя или почта — от двух букв">
          </div>

          <div v-if="foundUsers.length" class="user-found">
            <button v-for="u in foundUsers" :key="u.id" class="user-hit" @click="pickUser(u)">
              <UserAvatar :src="u.avatarUrl" :name="u.name" :frame="null" :size="26" alt="" />
              <span class="user-hit-name">{{ u.name }}</span>
              <span class="user-hit-mail">{{ u.email }}</span>
            </button>
          </div>

          <div v-if="grantTarget" class="grant-row">
            <UserAvatar :src="grantTarget.avatarUrl" :name="grantTarget.name" :frame="null" :size="32" alt="" />
            <span class="grant-name">{{ grantTarget.name }}</span>

            <select v-model="grantFrameId" class="grant-select">
              <option value="random">Случайная из раздачи</option>
              <option v-for="f in frames" :key="f.id" :value="f.id">{{ f.name }}</option>
            </select>

            <button class="btn-action" :disabled="granting" @click="sendGrant(grantTarget.id, grantFrameId)">
              {{ granting ? '...' : 'Выдать' }}
            </button>
          </div>

          <p v-if="grantMsg" class="result-msg">{{ grantMsg }}</p>

          <!-- Кто чем владеет -->
          <h3 class="frames-sub">Владельцы ({{ frameOwners.length }})</h3>
          <p v-if="!frameOwners.length" class="empty-hint">Пока никому ничего не выдано</p>

          <div v-for="o in frameOwners" :key="o.id" class="owner-row">
            <UserAvatar :src="o.avatarUrl" :name="o.name" :frame="null" :size="28" alt="" />
            <span class="owner-name">{{ o.name }}</span>

            <span class="owner-frames">
              <button
                v-for="uf in o.frames"
                :key="uf.id"
                class="owner-frame"
                :class="{ worn: o.wearing === uf.id }"
                :title="o.wearing === uf.id ? 'Носит сейчас — нажми, чтобы забрать' : 'Забрать рамку'"
                @click="sendGrant(o.id, uf.id, true)"
              >{{ frameName(uf.id) }} ×</button>
            </span>
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
            <label>Бегущая строка под hero</label>
            <textarea v-model="form.hero_ticker" rows="4" placeholder="Каждая строка — отдельная фраза" />
            <span class="field-hint">
              По фразе на строку — на сайте они пойдут в ряд через точку и будут
              повторяться по кругу. Скорость подбирается сама по длине текста.
              Строку видят только незарегистрированные читатели, клик по ней
              ведёт на вход.
            </span>
          </div>
          <label class="checkbox-row">
            <input v-model="tickerOn" type="checkbox">
            <span>Показывать бегущую строку (галочку можно снять, текст сохранится)</span>
          </label>
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
            <label>Блок про телеграм — заголовок</label>
            <input v-model="form.tg_cta_title" type="text" placeholder="Не пропусти новую главу">
          </div>
          <div class="field-row">
            <label>Блок про телеграм — текст</label>
            <textarea v-model="form.tg_cta_text" rows="2" placeholder="Бот в телеграм-канале присылает уведомление о каждой новой главе сразу после публикации." />
          </div>
          <div class="field-row">
            <label>Ссылка Boosty</label>
            <input v-model="form.boosty_url" type="url" placeholder="https://boosty.to/...">
          </div>
          <div class="field-row">
            <label>Ссылка Tribute</label>
            <input v-model="form.tribute_url" type="url" placeholder="https://tribute.tg/...">
          </div>
          <div class="field-row">
            <label>Текст страницы 404</label>
            <input v-model="form.error_404_sub" type="text" placeholder="Козёл добрался до этой страницы раньше тебя.">
          </div>
          <div class="field-row">
            <label>Глав в неделю</label>
            <input v-model="form.update_schedule" type="text" placeholder="2–3">
          </div>
          <div class="field-row">
            <label>Игра: до какого тома</label>
            <input v-model="form.game_max_volume" type="number" min="1" max="10" placeholder="пусто — по переводу">
            <span class="field-hint">
              Оставь пустым — потолок держится за границу перевода сам: берётся самый поздний
              том среди опубликованных глав. Число ставь, только если нужно открыть игру шире
              или, наоборот, придержать. Персонаж дня берётся из тех, кто появился до этого
              тома, спойлерные признаки скрываются; в свободной игре том выбирает сам игрок.
            </span>
          </div>
          <div class="field-row">
            <label>Игра: заголовок баннера</label>
            <input v-model="form.game_cta_title" type="text" placeholder="Кто из таверны?">
          </div>
          <div class="field-row">
            <label>Игра: текст баннера</label>
            <textarea v-model="form.game_cta_text" rows="3" />
            <span class="field-hint">
              Плашка на главной, перед оглавлением. Вместо <b>{том}</b> подставится номер
              из поля выше — так обещание «без спойлеров» не устареет, когда перевод уйдёт дальше.
            </span>
          </div>
          <button class="btn-action" :disabled="savingSettings" @click="saveSettings">
            {{ settingsSaved ? '✓ Сохранено' : savingSettings ? 'Сохраняем...' : 'Сохранить' }}
          </button>
        </section>

        <!-- Уведомления -->
        <section v-if="activeTab === 'notify'" class="card">
          <h2>Уведомления в Telegram</h2>
          <p class="notify-hint">
            Отправляет сообщение прямо сейчас — в любое время и сколько угодно раз.
            Расписание автоматической рассылки от этого не сдвигается: она уходит около 12:00 МСК
            и никогда не приходит читателям ночью.
          </p>

          <p v-if="notifyData && !notifyData.configured" class="form-error">
            Бот не настроен: нет TELEGRAM_BOT_TOKEN или TELEGRAM_CHANNEL_ID.
          </p>
          <p class="notify-last">Автоматическая рассылка последний раз: {{ formatNotifyDate(notifyData?.lastNotifyAt) }}</p>

          <h3 class="notify-sub">Ещё не отправляли ({{ pendingChapters.length }})</h3>
          <div v-if="pendingChapters.length" class="notify-list">
            <label v-for="ch in pendingChapters" :key="ch.id" class="notify-row">
              <input v-model="selectedNotifyIds" type="checkbox" :value="ch.id">
              <span class="chapter-row-id">{{ ch.id }}</span>
              <span class="chapter-row-title">{{ ch.title }}</span>
            </label>
          </div>

          <div v-if="notifyPreview" class="notify-preview">
            <div class="notify-preview-label">Текст сообщения</div>
            <pre class="notify-preview-text">{{ notifyPreview }}</pre>
          </div>

          <div v-if="notifyError" class="form-error">{{ notifyError }}</div>
          <button class="btn-action" :disabled="sendingNotify || !selectedNotifyIds.length" @click="sendNotify">
            {{ sendingNotify ? 'Отправляем...' : `Отправить в Telegram (${selectedNotifyIds.length})` }}
          </button>
          <p v-if="notifyResult" class="result-msg">{{ notifyResult }}</p>
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
          <button class="sb-tab" :class="{ active: activeTab === 'notify' }" @click="activeTab = 'notify'">
            <span class="sb-icon">✈</span>
            Уведомления
          </button>
          <button class="sb-tab" :class="{ active: activeTab === 'stats' }" @click="activeTab = 'stats'">
            <span class="sb-icon">📊</span>
            Статистика
          </button>
          <button class="sb-tab" :class="{ active: activeTab === 'comments' }" @click="activeTab = 'comments'">
            <span class="sb-icon">💬</span>
            Комментарии
          </button>
          <button class="sb-tab" :class="{ active: activeTab === 'frames' }" @click="activeTab = 'frames'">
            <span class="sb-icon">◎</span>
            Рамки
          </button>
          <NuxtLink href="/game" class="sb-tab">
            <span class="sb-icon">🎲</span>
            Игра
          </NuxtLink>
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

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: var(--parchment-2);
  margin-bottom: 16px;
  cursor: pointer;
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

.err-msg {
  font-size: 13px;
  color: #e07070;
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

/* ── Рамки для аватарок ──────────────────────── */
.frames-note {
  font-size: 13px;
  line-height: 1.5;
  opacity: .55;
  margin: -12px 0 22px;
  max-width: 60ch;
}

.frames-sub {
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 14px;
}

/* Предпросмотр — на своей же аватарке: посадку рамки нельзя выбрать в
   отвлечённом виде, её подгоняют, глядя на живое лицо в кружке. */
.frame-preview {
  background: rgba(241, 230, 210, .08);
  color: var(--parchment);
}

.frame-new {
  display: flex;
  align-items: flex-start;
  gap: 26px;
}

.frame-new-fields {
  flex: 1;
  min-width: 0;
}

.frame-row {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 14px 0;
  border-top: 1px solid rgba(241, 230, 210, .08);
}

.frame-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.frame-row-name {
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 14px;
  padding: 4px 7px;
  margin-left: -7px;
  width: 100%;
  max-width: 280px;
}

.frame-row-name:hover { border-color: rgba(241, 230, 210, .15); }
.frame-row-name:focus-visible { outline: none; border-color: var(--ember-soft); }

.frame-row-line {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 12px;
  opacity: .6;
}

.frame-fit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.frame-fit input { width: 110px; }

.frame-pool {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.frame-owners { margin-left: auto; }

.frame-del {
  background: none;
  border: none;
  padding: 0;
  color: #e07070;
  font-family: var(--font-body);
  font-size: 12px;
  cursor: pointer;
}

.frame-del:hover { text-decoration: underline; }

/* Рамка новичка — не такая же строка каталога, а правило, которое к нему
   применяется: оттого своя полоса, а не ещё одна карточка. */
.newcomer {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding: 14px 16px;
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: var(--radius-md);
  background: rgba(241, 230, 210, .03);
}

.newcomer-text {
  flex: 1;
  min-width: 220px;
  font-size: 12.5px;
  line-height: 1.5;
  opacity: .65;
}

/* ── Выдача ─────────────────────────────────── */
.user-found {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin: -6px 0 16px;
}

.user-hit {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.user-hit:hover { background: rgba(241, 230, 210, .06); }

.user-hit-mail {
  margin-left: auto;
  font-size: 11.5px;
  opacity: .4;
}

.grant-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.grant-name {
  font-size: 14px;
}

.grant-select {
  background: rgba(241, 230, 210, .05);
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-md);
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 13px;
  padding: 8px 10px;
}

.owner-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid rgba(241, 230, 210, .08);
}

.owner-name { font-size: 13.5px; }

.owner-frames {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* Носимая рамка отмечена — забрать её можно, но видно, что человек в ней
   сейчас ходит. */
.owner-frame {
  background: rgba(241, 230, 210, .06);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 11.5px;
  padding: 4px 8px;
  cursor: pointer;
  opacity: .7;
}

.owner-frame.worn {
  border-color: var(--ember-soft);
  opacity: 1;
}

.owner-frame:hover { color: #e07070; }

@media (max-width: 640px) {
  .frame-new {
    flex-direction: column;
    align-items: center;
  }
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

.chapter-row-draft {
  font-size: 11px;
  color: var(--ember-soft);
  border: 1px solid rgba(214, 136, 62, .3);
  border-radius: 4px;
  padding: 2px 6px;
  white-space: nowrap;
  flex: 0 0 auto;
}

.btn-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid rgba(200, 80, 80, .3);
  color: #c66;
  width: 28px;
  height: 28px;
  padding: 0;
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

/* Сегодняшний счётчик — единственный живой на этом экране, остальные копятся
   годами. Подсвечен рамкой, чтобы глаз находил его первым. */
.stat-card--today {
  border-color: rgba(214, 136, 62, .35);
  background: rgba(214, 136, 62, .07);
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

/* Строка про читателей идёт сразу под плитками и держится к ним ближе, чем к
   следующему заголовку: это подпись к ним, а не отдельный раздел. */
.readers-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  margin: -18px 0 28px;
  font-size: 13px;
  color: var(--text-muted);
}

.readers-line b {
  color: var(--ember-soft);
  font-weight: 600;
}

.readers-line span + span::before {
  content: '·';
  margin-right: 12px;
  opacity: .45;
}

.readers-new {
  color: var(--moss);
}

.stats-sub {
  font-size: 13px;
  font-weight: 600;
  color: var(--parchment-2);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.stats-tablehead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.stats-tablehead .stats-sub {
  margin: 0;
}

.stats-found {
  color: var(--ink-soft);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}

.stats-search {
  background: rgba(241, 230, 210, .05);
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-md);
  color: var(--parchment);
  padding: 7px 12px;
  font-family: var(--font-body);
  font-size: 13px;
  width: 240px;
  max-width: 100%;
}

.stats-search::placeholder {
  color: var(--ink-soft);
}

.stats-search:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

.stats-table {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 560px;
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
  grid-template-columns: 52px minmax(0, 1fr) 78px 84px 92px;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(241, 230, 210, .06);
  font-size: 13px;
}

.stats-head {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-dark-2);
  border-bottom: 1px solid rgba(241, 230, 210, .12);
  padding-top: 10px;
  padding-bottom: 10px;
}

.stats-sort {
  background: none;
  border: none;
  padding: 0;
  font-family: var(--font-body);
  font-size: 11px;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--ink-soft);
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  transition: color .15s;
}

.stats-sort--num {
  text-align: right;
}

.stats-sort:hover {
  color: var(--parchment-2);
}

.stats-sort.active {
  color: var(--ember-soft);
}

/* Стрелка только у активной колонки: ▼ по убыванию, ▲ по возрастанию. */
.stats-sort.active::after {
  content: ' ▼';
  font-size: 8px;
}

.stats-sort.active.asc::after {
  content: ' ▲';
}

.stats-date {
  color: var(--ink-soft);
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
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
  justify-content: flex-end;
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

.card--wide {
  max-width: 1040px;
}

.card--fill {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 80px);
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
    height: calc(100dvh - 56px - 32px);
  }

  /* Пять колонок в телефон не влезают: название сжимается в многоточие, а
     подписи счётчиков шире своих ячеек. Строка разворачивается в две линии —
     сверху глава, снизу дата и счётчики. */
  .stats-row {
    grid-template-columns: 46px minmax(0, 1fr) auto auto;
    column-gap: 10px;
    row-gap: 3px;
  }

  .stats-id {
    grid-area: 1 / 1;
  }

  .stats-title {
    grid-area: 1 / 2 / 2 / -1;
    white-space: normal;
  }

  .stats-date {
    grid-area: 2 / 1 / 3 / 3;
  }

  .stats-views {
    grid-area: 2 / 3;
  }

  .stats-dl {
    grid-area: 2 / 4;
  }

  /* Шапка превращается в строку переключателей: сеткой её колонки не совпадут
     с двухэтажными строками ниже. */
  .stats-head {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
  }

  .stats-head > span {
    display: none;
  }

  .stats-sort--num {
    text-align: left;
  }

  .stats-search {
    width: 100%;
  }

  .stats-table {
    max-height: 60dvh;
  }
}

/* Уведомления */
.notify-hint {
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-soft);
  margin: 0 0 14px;
}

/* ── Счётчики игры ──────────────────────────── */
.game-stats {
  max-width: 460px;
  margin-bottom: 8px;
}

.game-stats-row {
  display: grid;
  grid-template-columns: 1fr 110px 110px;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(42, 30, 22, .08);
  font-size: 13.5px;
}

/* Числа стоят по центру своей колонки — ровно под подписью «Сегодня» и «За всё время». */
.game-stats-row span:not(:first-child) {
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.game-stats-head {
  font-size: 11px;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

/* Пояснение под полем настройки — там, где одного названия мало. */
.field-hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink-soft);
  opacity: .8;
}

.notify-last {
  font-size: 12.5px;
  color: var(--parchment-2);
  margin: 0 0 18px;
}

.notify-sub {
  font-size: 13px;
  font-weight: 600;
  color: var(--parchment-2);
  margin: 0 0 8px;
}

.notify-list {
  display: flex;
  flex-direction: column;
  margin-bottom: 14px;
}

.notify-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.notify-row:hover {
  background: rgba(241, 230, 210, .04);
}

.notify-preview {
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  margin-bottom: 16px;
}

.notify-preview-label {
  font-size: 11px;
  color: var(--ink-soft);
  letter-spacing: .04em;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.notify-preview-text {
  margin: 0;
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.5;
  color: var(--parchment-2);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
