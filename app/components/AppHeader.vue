<script setup lang="ts">
// Шапка одна на всех ширинах: слева бургер и таверна, справа «Поддержать»
// и аватарка. Вся навигация уехала в шторку (AppDrawer) — ряд ссылок в шапке
// на планшете переставал помещаться, а на телефоне его всё равно прятали.
defineProps<{
  telegramUrl?: string
  boostyUrl?: string
  tributeUrl?: string
  commentsHref?: string
  commentsLabel?: string
  backToChapterHref?: string
  backToChapterLabel?: string
  transparentTop?: boolean
}>()

const menuOpen = ref(false)
const route = useRoute()
const auth = useAuthStore()

// Вход и профиль стоят в шапке на каждой странице: решение войти приходит там,
// где человека застала мысль, а не там, где мы положили ссылку.
//
// Вход возвращает туда, откуда позвали: читателю незачем терять место в главе
// ради того, чтобы подписать комментарий своим именем.
const loginHref = computed(() => `/login?next=${encodeURIComponent(route.fullPath)}`)
const scrolled = ref(false)

// Сервер не знает, кто вошёл (auth.client.ts), и рисует шапку для гостя. В
// админке middleware дожидается пользователя ещё до гидрации — и браузер
// оживлял бы гостевую разметку данными вошедшего: в сборке Vue такое
// расхождение не чинит, и аватарка получала классы заглушки. Поэтому всё, что
// зависит от входа, показываем только после монтирования.
const hydrated = ref(false)
const authed = computed(() => hydrated.value && auth.isAuthed)

defineExpose({ close: () => { menuOpen.value = false } })

watch(() => route.fullPath, () => { menuOpen.value = false })

const scrollTop = () => {
  // На других страницах переход и сброс скролла уже делает router.options.ts —
  // не дёргаем анимацию до навигации, иначе прогресс главы сохранится как «в начале».
  if (route.path === '/') {
    smoothScrollTo(0)
  }
}

const onScroll = () => {
  scrolled.value = window.scrollY > 10
}

onMounted(() => {
  hydrated.value = true
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <header class="app-header" :class="{ 'is-transparent': transparentTop && !scrolled && !menuOpen }">
    <div class="h-left">
      <button
        type="button"
        class="burger"
        aria-label="Меню"
        :aria-expanded="menuOpen"
        @click="menuOpen = true"
      >
        <NavIcon name="burger" :size="22" />
      </button>
      <NuxtLink href="/" class="brand" @click="scrollTop">
        <NuxtImg src="/hearth.webp" class="brand-logo" width="32" height="32" alt="" />
        <span class="brand-name">Странствующая Таверна</span>
      </NuxtLink>
    </div>

    <div class="h-right">
      <SupportLinks :boosty-url="boostyUrl" :tribute-url="tributeUrl" link-class="nav-support" />
      <NuxtLink v-if="authed" to="/profile" class="user-chip" :title="auth.name">
        <UserAvatar
          class="user-pic"
          :src="auth.user?.avatarUrl"
          :name="auth.name"
          :frame="auth.user?.avatarFrame"
          :size="28"
          alt="Профиль"
        />
      </NuxtLink>
      <NuxtLink v-else :to="loginHref" class="nav-link">Войти</NuxtLink>
    </div>

    <!-- Шторка при загрузке закрыта, а содержимое у неё целиком от входа:
         рисуем её только в браузере, чтобы не спорить с серверной разметкой. -->
    <ClientOnly>
      <AppDrawer
        :open="menuOpen"
        :telegram-url="telegramUrl"
        :boosty-url="boostyUrl"
        :tribute-url="tributeUrl"
        :comments-href="commentsHref"
        :comments-label="commentsLabel"
        :back-to-chapter-href="backToChapterHref"
        :back-to-chapter-label="backToChapterLabel"
        @close="menuOpen = false"
      />
    </ClientOnly>
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
  gap: 12px;
  padding: 0 24px 0 12px;
  background: var(--bg-dark);
  border-bottom: 1px solid rgba(241, 230, 210, .08);
  transition: background .25s ease, border-color .25s ease;
}

.app-header.is-transparent {
  background: transparent;
  border-bottom-color: transparent;
}

.h-left,
.h-right {
  display: flex;
  align-items: center;
  min-width: 0;
}

.h-left {
  gap: 6px;
}

.h-right {
  gap: 18px;
  flex-shrink: 0;
}

/* ── Бургер ─────────────────────────────────── */
.burger {
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
  transition: color .15s;
}

.burger:hover {
  color: var(--ember-soft);
}

/* ── Таверна ────────────────────────────────── */
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
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
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--parchment);
  letter-spacing: .02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Справа ─────────────────────────────────── */
/* :deep() — тот же класс приходит изнутри SupportLinks.vue, а scoped-стили
   сами через границу компонента не переходят. */
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

:deep(.nav-support) {
  display: inline-flex;
  align-items: center;
  font-size: 14px;
  white-space: nowrap;
  text-decoration: none;
  border: 1px solid rgba(201, 160, 46, .5);
  color: var(--gold);
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  transition: background .15s, color .15s;
}

:deep(.nav-support:hover) {
  background: var(--gold);
  color: var(--bg-dark);
}

.user-chip {
  display: flex;
  align-items: center;
  text-decoration: none;
}

/* Обводка — на самой картинке, иначе на тёмной шапке тёмная аватарка
   сливалась бы с фоном. Букве достаётся фон и цвет с самой аватарки. */
.user-pic {
  color: var(--parchment);
  background: rgba(241, 230, 210, .08);
}

.user-pic :deep(.ua-pic) {
  border: 1px solid rgba(241, 230, 210, .25);
}

/* Держим адаптив последним в файле: правила здесь того же веса, что и
   обычные, так что решает порядок. */
@media (max-width: 600px) {
  .app-header {
    padding: 0 12px 0 6px;
  }

  /* На телефоне «Поддержать» живёт в шторке — шапке хватит таверны и аватарки. */
  .h-right :deep(.support-links),
  :deep(.nav-support) {
    display: none;
  }

  .brand-name {
    font-size: 14px;
  }
}
</style>
