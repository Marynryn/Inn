<script setup lang="ts">
/**
 * Огонёк на карточке: клик зажигает или гасит. Кнопка сама останавливает
 * всплытие, чтобы клик по ней не открывал карточку.
 *
 * Админ, зажав огонёк на полсекунды, видит, кто его зажигал, — и огонёк при
 * этом не переключается. Читателю долгое нажатие ничего не делает.
 */
const props = defineProps<{
  count: number
  lit: boolean
  characterId?: string
}>()

const emit = defineEmits<{
  toggle: []
}>()

const auth = useAuthStore()
const canPeek = computed(() => auth.isAdmin && Boolean(props.characterId) && props.count > 0)

const HOLD_MS = 500
const btn = ref<HTMLButtonElement | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null
// Зажатие уже сработало — следующий за ним click огонёк не трогает.
let held = false

const who = ref<{ readers: string[], guests: number } | null>(null)
const whoError = ref('')
const pos = ref<{ left: number, top: number } | null>(null)

const guestsLabel = (n: number) => {
  const d = n % 10, dd = n % 100
  const word = d === 1 && dd !== 11 ? 'гость' : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'гостя' : 'гостей'
  return `${n} ${word}`
}

const close = () => {
  pos.value = null
  document.removeEventListener('pointerdown', onOutside, true)
  window.removeEventListener('scroll', close, true)
}

function onOutside(e: PointerEvent) {
  if (!btn.value?.contains(e.target as Node)) close()
}

// Окошко висит над огоньком поверх страницы, а не внутри карточки: там его
// обрезал бы край портрета.
const peek = async () => {
  const r = btn.value!.getBoundingClientRect()
  const half = 120
  pos.value = {
    left: Math.min(window.innerWidth - half - 8, Math.max(half + 8, r.left + r.width / 2)),
    top: r.top - 8,
  }
  document.addEventListener('pointerdown', onOutside, true)
  window.addEventListener('scroll', close, true)
  who.value = null
  whoError.value = ''
  try {
    who.value = await $fetch(`/api/admin/characters/${encodeURIComponent(props.characterId!)}/flames`)
  } catch {
    whoError.value = 'Список не загрузился'
  }
}

const cancelHold = () => {
  if (timer) clearTimeout(timer)
  timer = null
}

const onDown = () => {
  held = false
  if (!canPeek.value) return
  cancelHold()
  timer = setTimeout(() => {
    held = true
    timer = null
    peek()
  }, HOLD_MS)
}

const onClick = () => {
  cancelHold()
  if (held) {
    held = false
    return
  }
  close()
  emit('toggle')
}

onUnmounted(() => {
  cancelHold()
  close()
})
</script>

<template>
  <button
    ref="btn"
    class="flame"
    :class="{ lit, peekable: canPeek }"
    type="button"
    :aria-pressed="lit"
    :aria-label="lit ? 'Погасить огонёк' : 'Зажечь огонёк'"
    @pointerdown="onDown"
    @pointerup="cancelHold"
    @pointerleave="cancelHold"
    @pointercancel="cancelHold"
    @contextmenu="canPeek && $event.preventDefault()"
    @click.stop="onClick"
  >
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2c.6 3.2 2.4 4.9 4.2 6.8C18 10.7 19 12.6 19 15a7 7 0 0 1-14 0c0-2 .8-3.6 2-5 .3 1.5 1 2.5 2 3.2C9 10 9.5 6.5 12 2z" />
      <path class="core" d="M12 22a3.5 3.5 0 0 1-3.5-3.5c0-1.5 1-2.6 2-3.8.5.9 1.2 1.4 2 1.8.3-.9.5-2 .5-3.2 1.6 1.2 2.5 2.8 2.5 4.7A3.5 3.5 0 0 1 12 22z" />
    </svg>
    <span class="num">{{ count }}</span>
  </button>

  <Teleport to="body">
    <div v-if="pos" class="flame-who" role="status" :style="{ left: `${pos.left}px`, top: `${pos.top}px` }">
      <template v-if="whoError">{{ whoError }}</template>
      <template v-else-if="!who">Смотрим…</template>
      <template v-else>
        <span class="flame-who-title">Зажгли</span>
        {{ who.readers.join(', ') }}<template v-if="who.readers.length && who.guests"> и ещё </template><template v-if="who.guests">{{ guestsLabel(who.guests) }}</template>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
/* Огонёк сидит поверх портрета, а портреты бывают светлыми: подложка почти
   непрозрачная, да ещё и размывает то, что под ней, — иначе цифру на светлой
   картинке не разглядеть. */
.flame {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 4px 5px;
  border-radius: 999px;
  border: 1px solid rgba(241, 230, 210, .22);
  background: rgba(20, 15, 11, .88);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, .45);
  color: rgba(241, 230, 210, .85);
  font-family: var(--font-body);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: color .15s, border-color .15s, background .15s;
}

/* Огонёк, который админ может зажать: без выделения текста и системного меню
   по долгому касанию — иначе телефон перебивал бы его своим. */
.flame.peekable {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.flame-who {
  position: fixed;
  z-index: 1000;
  max-width: 240px;
  padding: 8px 12px;
  transform: translate(-50%, -100%);
  border-radius: var(--radius-md);
  border: 1px solid rgba(232, 176, 122, .35);
  background: #2b221c;
  box-shadow: 0 10px 28px rgba(0, 0, 0, .55);
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.45;
  text-align: left;
}

.flame-who-title {
  display: block;
  margin-bottom: 2px;
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--ember-soft);
}

.flame:hover {
  color: var(--ember-soft);
  border-color: rgba(232, 176, 122, .5);
}

.icon {
  width: 16px;
  height: 16px;
  fill: currentColor;
  transition: transform .2s;
}

.core {
  fill: var(--bg-dark);
  opacity: 0;
}

/* Зажжённый — та же тёмная основа с тёплым отливом: полупрозрачная оранжевая
   на светлом портрете сливалась бы с ним. */
.flame.lit {
  color: var(--ember);
  border-color: rgba(214, 136, 62, .75);
  background: linear-gradient(rgba(214, 136, 62, .22), rgba(214, 136, 62, .22)), rgba(20, 15, 11, .9);
}

.flame.lit .icon {
  transform: scale(1.12);
  filter: drop-shadow(0 0 5px rgba(214, 136, 62, .8));
}

.flame.lit .core {
  opacity: 1;
  fill: #ffd27a;
}

.flame.lit .num {
  color: var(--ember-soft);
}
</style>
