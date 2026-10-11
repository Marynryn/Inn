<script setup lang="ts">
const props = defineProps<{
  /** Вариант для тёмной подложки — как у TelegramCta рядом. */
  onDark?: boolean
}>()

/**
 * Приглашение войти под главой — только гостю, и не с первой главы: кто
 * прочёл одну, ещё присматривается. Закладка гостя живёт в браузере, и после
 * входа она уезжает на сервер (useReadProgress сводит их сама), так что
 * обещание «прогресс не потеряется» честное.
 *
 * Крестик прячет плашку, пока не прочитано ещё HIDE_FOR глав: навсегда
 * убирать незачем, но и возвращать в следующей же главе — значит надоедать.
 */
const MIN_READ = 2
const HIDE_FOR = 10
const LS_HIDDEN = 'tavern:signupNudgeHiddenAt'

const auth = useAuthStore()
const route = useRoute()
const { readChapters } = useReadProgress()

const hiddenAt = ref<number | null>(null)
onMounted(() => {
  try {
    const raw = localStorage.getItem(LS_HIDDEN)
    hiddenAt.value = raw ? Number(raw) : null
  } catch {}
})

const readCount = computed(() => readChapters.value.length)

// До ответа /api/auth/me «не вошёл» значит «ещё не знаем» — вошедшему плашка
// не должна мелькнуть.
const visible = computed(() =>
  auth.ready && !auth.isAuthed
  && readCount.value >= MIN_READ
  && (hiddenAt.value == null || readCount.value >= hiddenAt.value + HIDE_FOR)
)

const loginHref = computed(() => `/login?next=${encodeURIComponent(route.fullPath)}`)

const hide = () => {
  hiddenAt.value = readCount.value
  try { localStorage.setItem(LS_HIDDEN, String(readCount.value)) } catch {}
}
</script>

<template>
  <aside v-if="visible" class="signup-nudge" :class="{ 'on-dark': props.onDark }">
    <span class="sn-icon" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
      </svg>
    </span>

    <div class="sn-body">
      <p class="sn-title">Не потеряй закладку</p>
      <p class="sn-sub">
        Закладка пока живёт только в этом браузере.
        Войди через Google или Телеграм — прогресс сохранится и откроется на любом устройстве.
      </p>
    </div>

    <NuxtLink :to="loginHref" class="sn-btn">Войти</NuxtLink>

    <button type="button" class="sn-close" title="Скрыть" aria-label="Скрыть" @click="hide">✕</button>
  </aside>
</template>

<style scoped>
.signup-nudge {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 44px 18px 22px;
  border: 1px solid rgba(43, 30, 22, .14);
  border-left: 3px solid var(--ember);
  border-radius: var(--radius-md);
  background: rgba(214, 136, 62, .06);
}

.sn-icon {
  flex-shrink: 0;
  display: flex;
  color: var(--ember);
}

.sn-body {
  flex: 1;
  min-width: 0;
}

.sn-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}

.sn-sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-soft);
}

.sn-btn {
  flex-shrink: 0;
  padding: 10px 22px;
  border-radius: var(--radius-sm);
  background: var(--ember);
  color: var(--bg-dark);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  transition: background .15s;
}

.sn-btn:hover {
  background: var(--ember-soft);
}

.sn-close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  opacity: .6;
}

.sn-close:hover {
  opacity: 1;
  background: rgba(43, 30, 22, .08);
}

.signup-nudge.on-dark {
  border-color: rgba(241, 230, 210, .14);
  border-left-color: var(--ember);
  background: rgba(241, 230, 210, .04);
}

.on-dark .sn-title {
  color: var(--parchment);
}

.on-dark .sn-sub,
.on-dark .sn-close {
  color: var(--text-muted);
}

.on-dark .sn-close:hover {
  background: rgba(241, 230, 210, .08);
}

@media (max-width: 600px) {
  .signup-nudge {
    flex-wrap: wrap;
    gap: 12px;
    padding: 16px 40px 16px 18px;
  }

  .sn-body {
    flex-basis: calc(100% - 38px);
  }

  .sn-btn {
    width: 100%;
    text-align: center;
  }
}
</style>
