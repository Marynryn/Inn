<script setup lang="ts">
// Шторка меню: выезжает слева на всю высоту, на любой ширине экрана.
// Навигация по сайту живёт только здесь — в шапке остались логотип,
// «Поддержать» и аватарка.
const props = defineProps<{
  open: boolean
  telegramUrl?: string
  boostyUrl?: string
  tributeUrl?: string
  commentsHref?: string
  commentsLabel?: string
  backToChapterHref?: string
  backToChapterLabel?: string
}>()

const emit = defineEmits<{ close: [] }>()

const route = useRoute()
const auth = useAuthStore()

const loginHref = computed(() => `/login?next=${encodeURIComponent(route.fullPath)}`)

const onAdmin = computed(() => route.path === '/admin')
const adminTab = computed(() => toAdminTab(route.query.tab))

const close = () => emit('close')

const tabs = ADMIN_TABS
const { has: unreadMessages } = useAdminUnread()

// До списка глав доводит сам роутер (router.options.ts). Если адрес уже
// /#ledger, перехода не будет — тогда докручиваем сами.
const goToChapters = () => {
  close()
  if (route.path === '/' && route.hash === '#ledger') {
    nextTick(() => {
      const el = document.getElementById('ledger')
      if (el) smoothScrollTo(el.getBoundingClientRect().top + window.scrollY - 64)
    })
  }
}

const logout = async () => {
  close()
  await auth.logout()
  if (route.path === '/admin' || route.path === '/profile') navigateTo('/')
}

const supportLinks = computed(() => [
  props.boostyUrl && { label: 'Boosty', href: props.boostyUrl },
  props.tributeUrl && { label: 'Tribute', href: props.tributeUrl },
].filter(Boolean) as { label: string, href: string }[])

// ── Открытие: страница под шторкой стоит, Esc и свайп влево закрывают ──
const closeBtn = ref<HTMLButtonElement | null>(null)

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') close()
}

// Полоса прокрутки при блокировке исчезает, и страница прыгала бы вбок на
// её ширину — возвращаем это место отступом.
const lockScroll = (lock: boolean) => {
  const html = document.documentElement
  if (lock) {
    const gap = window.innerWidth - html.clientWidth
    html.style.overflow = 'hidden'
    if (gap > 0) html.style.paddingRight = `${gap}px`
  }
  else {
    html.style.overflow = ''
    html.style.paddingRight = ''
  }
}

watch(() => props.open, (open) => {
  if (!import.meta.client) return
  lockScroll(open)
  if (open) {
    document.addEventListener('keydown', onKey)
    nextTick(() => closeBtn.value?.focus({ preventScroll: true }))
  }
  else {
    document.removeEventListener('keydown', onKey)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKey)
  if (props.open) lockScroll(false)
})

let touchX = 0
let touchY = 0
const onTouchStart = (e: TouchEvent) => {
  touchX = e.touches[0]!.clientX
  touchY = e.touches[0]!.clientY
}
const onTouchEnd = (e: TouchEvent) => {
  const dx = e.changedTouches[0]!.clientX - touchX
  const dy = e.changedTouches[0]!.clientY - touchY
  if (dx < -60 && Math.abs(dx) > Math.abs(dy)) close()
}
</script>

<template>
  <div class="drawer-root" :class="{ open }">
    <div class="drawer-overlay" @click="close" />

    <aside
      class="drawer"
      aria-label="Меню"
      :aria-hidden="!open"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <div class="drawer-top">
        <NuxtLink v-if="auth.isAuthed" to="/profile" class="me" :class="{ active: route.path === '/profile' }" @click="close">
          <UserAvatar
            :src="auth.user?.avatarUrl"
            :name="auth.name"
            :frame="auth.user?.avatarFrame"
            :size="40"
            alt=""
          />
          <span class="me-text">
            <span class="me-name">{{ auth.name }}</span>
            <span class="me-sub">Профиль</span>
          </span>
        </NuxtLink>
        <NuxtLink v-else :to="loginHref" class="me" @click="close">
          <span class="me-guest"><NavIcon name="user" :size="20" /></span>
          <span class="me-login">Войти</span>
        </NuxtLink>

        <button ref="closeBtn" type="button" class="drawer-close" aria-label="Закрыть меню" @click="close">
          <NavIcon name="close" :size="20" />
        </button>
      </div>

      <nav class="drawer-nav thin-scroll">
        <!-- В админке её вкладки идут первыми: на телефоне за ними меню и открывают. -->
        <template v-if="auth.isAdmin && onAdmin">
          <div class="drawer-section">Админка</div>
          <SideNavLink
            v-for="t in tabs"
            :key="t.key"
            :to="`/admin?tab=${t.key}`"
            :icon="t.icon"
            :label="t.label"
            :active="adminTab === t.key"
            :dot="t.key === 'messages' && unreadMessages"
            compact
            @click="close"
          />
        </template>

        <div class="drawer-section">Читать</div>
        <SideNavLink
          v-if="backToChapterHref"
          :to="backToChapterHref"
          icon="back"
          :label="backToChapterLabel || 'К главе'"
          accent
          @click="close"
        />
        <SideNavLink to="/#ledger" icon="book" label="Главы" :active="route.path === '/'" @click="goToChapters" />
        <SideNavLink
          v-if="commentsHref"
          :to="commentsHref"
          icon="chat"
          :label="commentsLabel || 'Обсуждение главы'"
          @click="close"
        />
        <SideNavLink to="/progress" icon="progress" label="Прогресс" :active="route.path === '/progress'" @click="close" />

        <div class="drawer-section">Таверна</div>
        <SideNavLink to="/game" icon="dice" label="Игра" :active="route.path === '/game'" @click="close" />
        <SideNavLink to="/characters" icon="users" label="Персонажи" :active="route.path === '/characters'" @click="close" />
        <SideNavLink to="/about" icon="info" label="О проекте" :active="route.path === '/about'" @click="close" />

        <template v-if="auth.isAdmin && !onAdmin">
          <div class="drawer-section">Для админов</div>
          <SideNavLink to="/admin" icon="shield" label="Админка" @click="close" />
        </template>
      </nav>

      <div class="drawer-bottom">
        <a v-if="telegramUrl" :href="telegramUrl" target="_blank" rel="noopener" class="tg" @click="close">
          <NavIcon name="send" />
          <span>Telegram</span>
        </a>

        <template v-if="supportLinks.length">
          <div class="support-caption">
            <NavIcon name="heart" :size="14" />
            Поддержать перевод
          </div>
          <div class="support-row" :class="{ single: supportLinks.length === 1 }">
            <a
              v-for="s in supportLinks"
              :key="s.label"
              :href="s.href"
              target="_blank"
              rel="noopener"
              class="support-btn"
              @click="close"
            >{{ supportLinks.length === 1 ? 'Поддержать' : s.label }}</a>
          </div>
        </template>

        <button v-if="auth.isAuthed" type="button" class="logout" @click="logout">
          <NavIcon name="logout" :size="16" />
          Выйти
        </button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
/* Шторка лежит внутри шапки, но в её раскладке не участвует — иначе пустой
   контейнер встал бы третьим и растащил шапку. */
.drawer-root {
  display: contents;
}

.drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 1;
  background: rgba(10, 7, 5, .6);
  opacity: 0;
  pointer-events: none;
  transition: opacity .25s ease;
}

.drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 2;
  width: min(300px, 85vw);
  display: flex;
  flex-direction: column;
  background: #241c16;
  border-right: 1px solid rgba(241, 230, 210, .08);
  box-shadow: 12px 0 40px rgba(0, 0, 0, .45);
  transform: translateX(-105%);
  /* Закрытая шторка невидима и для клавиатуры с читалками, а не только
     уехала за край: visibility переключается, когда выезд уже доиграл. */
  visibility: hidden;
  transition: transform .3s cubic-bezier(.4, 0, .2, 1), visibility 0s .3s;
}

.open .drawer-overlay {
  opacity: 1;
  pointer-events: auto;
}

.open .drawer {
  transform: none;
  visibility: visible;
  transition: transform .3s cubic-bezier(.4, 0, .2, 1);
}

/* ── Верх: кто вошёл ────────────────────────── */
.drawer-top {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 8px 12px 12px;
  border-bottom: 1px solid rgba(241, 230, 210, .08);
  flex-shrink: 0;
}

.me {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 8px;
  text-decoration: none;
  transition: background .15s;
}

.me:hover {
  background: rgba(241, 230, 210, .05);
}

.me.active {
  background: rgba(214, 136, 62, .14);
}

.me :deep(.ua-pic) {
  border: 1px solid rgba(241, 230, 210, .25);
}

.me-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.me-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--parchment);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.me-sub {
  font-size: 12px;
  color: var(--text-muted);
}

.me-guest {
  width: 40px;
  height: 40px;
  box-sizing: border-box;
  border-radius: 50%;
  border: 1.5px dashed rgba(241, 230, 210, .3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  flex-shrink: 0;
}

.me-login {
  font-size: 15px;
  font-weight: 500;
  color: var(--ember-soft);
}

.drawer-close {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--parchment-2);
  cursor: pointer;
}

.drawer-close:hover {
  color: var(--ember-soft);
}

/* ── Пункты ─────────────────────────────────── */
.drawer-nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px 12px;
}

.drawer-section {
  padding: 18px 12px 6px;
  font-size: 11px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* ── Низ: внешние ссылки ────────────────────── */
.drawer-bottom {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 16px 14px;
  border-top: 1px solid rgba(241, 230, 210, .08);
}

.tg {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
  padding: 0 12px;
  border-radius: 6px;
  color: var(--parchment-2);
  font-size: 14px;
  text-decoration: none;
  transition: background .15s, color .15s;
}

.tg:hover {
  background: rgba(241, 230, 210, .06);
  color: var(--parchment);
}

.support-caption {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 2px;
  font-size: 12px;
  color: var(--text-muted);
}

.support-caption .nav-icon {
  color: var(--gold);
}

.support-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.support-row.single {
  grid-template-columns: 1fr;
}

.support-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  border-radius: 6px;
  border: 1px solid rgba(201, 160, 46, .6);
  color: var(--gold);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: background .15s, color .15s;
}

.support-btn:hover {
  background: var(--gold);
  color: var(--bg-dark);
}

.logout {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 12px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
}

.logout:hover {
  color: var(--parchment-2);
}
</style>
