<script setup lang="ts">
defineProps<{
  backHref?: string
  backLabel?: string
  showBrand?: boolean
  chapterVol?: number
  chapterId?: string
  chapterTitle?: string
  showHomeLink?: boolean
  showNavLinks?: boolean
  telegramUrl?: string
  supportUrl?: string
  commentsHref?: string
  commentsLabel?: string
  burgerLeft?: boolean
  backToChapterHref?: string
  backToChapterLabel?: string
}>()

const menuOpen = ref(false)
const route = useRoute()
const slots = useSlots()

defineExpose({ close: () => { menuOpen.value = false } })

watch(() => route.fullPath, () => { menuOpen.value = false })

const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

const goToChapters = (e: Event) => {
  menuOpen.value = false
  if (route.path === '/') {
    e.preventDefault()
    const el = document.getElementById('ledger')
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 64
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }
}

onMounted(() => {
  document.addEventListener('click', (e) => {
    const header = document.querySelector('.app-header')
    if (header && !header.contains(e.target as Node)) {
      menuOpen.value = false
    }
  })
})
</script>

<template>
  <header class="app-header">

    <!-- LEFT -->
    <div class="h-left">
      <!-- страница комментариев: иконка таверны слева -->
      <NuxtLink v-if="burgerLeft" href="/" class="brand-icon" @click="scrollTop">
        <NuxtImg src="/header.png" width="30" height="30" format="webp" alt="Странствующая Таверна" />
      </NuxtLink>
      <NuxtLink v-else-if="backHref" :href="backHref" class="back-link">
        {{ backLabel ?? '← Назад' }}
      </NuxtLink>
      <NuxtLink v-else-if="showNavLinks" href="/" class="brand" @click="scrollTop">
        <NuxtImg src="/header.png" class="brand-logo" width="32" height="32" format="webp" alt="" />
        <span class="brand-name">Странствующая Таверна</span>
      </NuxtLink>
    </div>

    <!-- CENTER -->
    <div class="h-center">
      <template v-if="showBrand">
        <NuxtImg src="/header.png" class="brand-logo" width="32" height="32" format="webp" alt="" />
        <span class="brand-name display">Странствующая Таверна</span>
      </template>
      <template v-else-if="chapterId && !burgerLeft">
        <span class="chapter-vol">Том {{ chapterVol }} · {{ chapterId }}</span>
        <span class="chapter-title">{{ chapterTitle }}</span>
      </template>
    </div>

    <!-- RIGHT -->
    <div class="h-right">
      <!-- страница комментариев: десктоп-ссылки + бургер справа -->
      <template v-if="burgerLeft">
        <a href="/#ledger" class="nav-link hide-mobile" @click="goToChapters">Главы</a>
        <a :href="telegramUrl || '#'" target="_blank" rel="noopener" class="nav-link hide-mobile">
          Telegram        </a>
        <a :href="supportUrl || '#'" target="_blank" rel="noopener" class="nav-link nav-support hide-mobile">
          Поддержать        </a>
        <button
          class="burger"
          :class="{ open: menuOpen }"
          aria-label="Меню"
          @click.stop="menuOpen = !menuOpen"
        >
          <span /><span /><span />
        </button>
      </template>
      <!-- обычный режим: ссылки + бургер справа -->
      <template v-else-if="showNavLinks">
        <a href="/#ledger" class="nav-link hide-mobile" @click="goToChapters">Главы</a>
        <NuxtLink v-if="commentsHref" :href="commentsHref" class="nav-link hide-mobile">Обсуждение</NuxtLink>
        <a :href="telegramUrl || '#'" target="_blank" rel="noopener" class="nav-link hide-mobile">
          Telegram <span class="ext">↗</span>
        </a>
        <a :href="supportUrl || '#'" target="_blank" rel="noopener" class="nav-link nav-support">
          Поддержать <span class="ext">↗</span>
        </a>
        <button
          class="burger"
          :class="{ open: menuOpen }"
          aria-label="Меню"
          @click.stop="menuOpen = !menuOpen"
        >
          <span /><span /><span />
        </button>
      </template>
      <NuxtLink v-else-if="showHomeLink" href="/" class="nav-link">На главную</NuxtLink>
      <span v-else />
    </div>

    <!-- MOBILE DROPDOWN -->
    <div v-if="showNavLinks || burgerLeft || slots.menu" class="mobile-menu" :class="{ open: menuOpen }">
      <slot name="menu">
        <NuxtLink v-if="backToChapterHref" :href="backToChapterHref" class="menu-link menu-back" @click="menuOpen = false">
          {{ backToChapterLabel || '← К главе' }}
        </NuxtLink>
        <a href="/#ledger" class="menu-link" @click="goToChapters">Главы</a>
        <NuxtLink v-if="commentsHref" :href="commentsHref" class="menu-link" @click="menuOpen = false">
          {{ commentsLabel || 'Обсуждение главы' }}
        </NuxtLink>
        <NuxtLink v-if="route.path !== '/about'" href="/about" class="menu-link" @click="menuOpen = false">О проекте</NuxtLink>
        <a :href="telegramUrl || '#'" target="_blank" rel="noopener" class="menu-link" @click="menuOpen = false">
          Telegram <span class="ext">↗</span>
        </a>
        <a :href="supportUrl || '#'" target="_blank" rel="noopener" class="menu-link menu-support" @click="menuOpen = false">
          Поддержать <span class="ext">↗</span>
        </a>
      </slot>
    </div>

  </header>
</template>

<style scoped>
.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--bg-dark);
  border-bottom: 1px solid rgba(241, 230, 210, .08);
}

/* ── Layout sections ────────────────────────── */
.h-left,
.h-right {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}

.h-right {
  justify-content: flex-end;
  gap: 22px;
}

.h-center {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ── Back link ──────────────────────────────── */
.back-link {
  font-size: 13px;
  color: var(--parchment-2);
  opacity: .8;
  transition: opacity .15s, color .15s;
  white-space: nowrap;
}

.back-link:hover {
  opacity: 1;
  color: var(--ember-soft);
}

/* ── Brand ──────────────────────────────────── */
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.brand-logo {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid var(--gold);
  flex-shrink: 0;
}

.brand-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--parchment);
  letter-spacing: .02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Chapter info ───────────────────────────── */
.chapter-vol {
  font-size: 12px;
  color: var(--ember-soft);
  font-family: var(--font-display);
  white-space: nowrap;
}

.chapter-title {
  font-size: 13px;
  color: var(--parchment-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

/* ── Nav links (desktop right) ──────────────── */
.nav-link {
  font-size: 14px;
  color: var(--parchment-2);
  opacity: .85;
  transition: color .15s, opacity .15s;
  white-space: nowrap;
  text-decoration: none;
}

.nav-link:hover {
  color: var(--ember-soft);
  opacity: 1;
}

.nav-support {
  border: 1px solid rgba(201, 160, 46, .5);
  color: var(--gold) !important;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  opacity: 1 !important;
  transition: background .15s, color .15s;
}

.nav-support:hover {
  background: var(--gold);
  color: var(--bg-dark) !important;
}

.ext {
  font-size: 11px;
  opacity: .7;
  margin-left: 2px;
}

/* ── Burger button ──────────────────────────── */
.burger {
  display: none;
  flex-direction: column;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 4px;
  flex-shrink: 0;
}

.burger span {
  display: block;
  width: 22px;
  height: 2px;
  background: var(--parchment-2);
  border-radius: 2px;
  transition: transform .25s ease, opacity .25s ease;
  transform-origin: center;
}

.burger.open span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}

.burger.open span:nth-child(2) {
  opacity: 0;
  transform: scaleX(0);
}

.burger.open span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

/* ── Mobile dropdown menu ───────────────────── */
.mobile-menu {
  position: absolute;
  top: 56px;
  left: 0;
  right: 0;
  background: var(--bg-dark);
  border-bottom: 1px solid rgba(241, 230, 210, .08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  transform: translateY(-6px);
  transition:
    max-height .35s cubic-bezier(0.4, 0, 0.2, 1),
    opacity .25s ease,
    transform .25s ease;
  pointer-events: none;
}

.mobile-menu.open {
  max-height: calc(100vh - 56px);
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.menu-link {
  padding: 16px 24px;
  font-size: 15px;
  color: var(--parchment-2);
  text-decoration: none;
  border-bottom: 1px solid rgba(241, 230, 210, .06);
  transition: color .15s, background .15s;
}

.menu-link:last-child {
  border-bottom: none;
}

.menu-link:hover {
  color: var(--ember-soft);
  background: rgba(241, 230, 210, .04);
}

.menu-support {
  color: var(--gold);
}

.menu-back {
  color: var(--ember-soft);
}

/* ── Brand icon (logo only, right side) ─────── */
.brand-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.brand-icon img {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid var(--gold);
}

/* ── Responsive ─────────────────────────────── */
@media (max-width: 600px) {
  .hide-mobile {
    display: none;
  }

  .nav-support {
    display: none;
  }

  .burger {
    display: flex;
  }

  /* скрыть название только в центре (страницы с back-link) */
  .h-center .brand-name,
  .chapter-title {
    display: none;
  }

  /* в левом блоке (главная) — оставить название, чуть меньший шрифт */
  .h-left .brand-name {
    display: block;
    font-size: 13px;
  }

  .h-right {
    gap: 12px;
  }
}
</style>
