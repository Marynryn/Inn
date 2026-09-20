<script setup lang="ts">
/**
 * Что сегодня читали или скачивали — сумма за день, разложенная по главам:
 * видно, одну ли главу открывали сто раз или сто глав по разу. Кто именно,
 * база не хранит: строка на главу за день, без людей. Просмотры и скачивания
 * различаются только словами, поэтому окно одно на оба.
 */
const props = defineProps<{
  kind: 'views' | 'downloads'
  rows: { id: string; title: string | null; count: number }[]
  total: number
}>()

const emit = defineEmits<{ close: [] }>()

const WORDS = {
  views: {
    title: 'Просмотры сегодня',
    unit: ['просмотр', 'просмотра', 'просмотров'] as [string, string, string],
    empty: 'Сегодня глав ещё не открывали',
  },
  downloads: {
    title: 'Скачивания сегодня',
    unit: ['скачивание', 'скачивания', 'скачиваний'] as [string, string, string],
    empty: 'Сегодня epub ещё не скачивали',
  },
}
const words = computed(() => WORDS[props.kind])

const plural = (n: number, forms: [string, string, string]) => {
  const ten = n % 10
  const hundred = n % 100
  if (ten === 1 && hundred !== 11) return forms[0]
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return forms[1]
  return forms[2]
}

const summary = computed(() => {
  const total = `${props.total.toLocaleString('ru')} ${plural(props.total, words.value.unit)}`
  const chapters = `${props.rows.length} ${plural(props.rows.length, ['главе', 'главах', 'главах'])}`
  return `${total} в ${chapters}`
})

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

useScrollLock()
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="words.title">
        <button class="close" type="button" aria-label="Закрыть" @click="emit('close')">×</button>

        <p class="modal-title">{{ words.title }}</p>
        <p class="modal-note">{{ summary }}</p>

        <div class="rows thin-scroll">
          <div v-for="r in rows" :key="r.id" class="row">
            <span class="row-id">{{ r.id }}</span>
            <span class="row-title" :class="{ gone: !r.title }">{{ r.title ?? 'глава снята с сайта' }}</span>
            <span class="row-num">{{ r.count.toLocaleString('ru') }}</span>
          </div>
          <p v-if="!rows.length" class="empty">{{ words.empty }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(20, 14, 10, .7);
  backdrop-filter: blur(3px);
  animation: fade-in .15s ease;
}

.modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(520px, 100%);
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  padding: 24px 24px 18px;
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: var(--radius-md);
  animation: slide-up .2s ease;
}

.close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--parchment-2);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.close:hover {
  color: var(--ember-soft);
}

.modal-title {
  margin: 0;
  padding-right: 32px;
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--parchment);
}

.modal-note {
  margin: 4px 0 16px;
  font-size: 13px;
  color: var(--ink-soft);
}

/* Список прокручивается сам, шапка остаётся на месте: за день глав набирается
   больше, чем влезает в окно. */
.rows {
  overflow-y: auto;
  margin: 0 -6px;
  padding: 0 6px;
}

.row {
  display: grid;
  grid-template-columns: 62px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid rgba(241, 230, 210, .08);
  font-size: 14px;
}

.row:first-child {
  border-top: none;
}

.row-id {
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}

.row-title {
  color: var(--parchment);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-title.gone {
  color: var(--ink-soft);
  font-style: italic;
}

.row-num {
  color: var(--ember-soft);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.empty {
  margin: 8px 0;
  color: var(--ink-soft);
  font-size: 14px;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@media (max-width: 560px) {
  .row {
    grid-template-columns: 52px 1fr auto;
    font-size: 13px;
  }
}
</style>
