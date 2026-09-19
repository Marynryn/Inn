<script setup lang="ts">
/**
 * Что читали сегодня. Счётчик на плитке — это сумма, а здесь та же сумма
 * разложена по главам: видно, одну ли главу открывали сто раз или сто глав по
 * разу. Кто именно читал, база не хранит: строка на главу за день, без людей.
 */
const props = defineProps<{
  rows: { id: string; title: string | null; views: number }[]
  total: number
}>()

const emit = defineEmits<{ close: [] }>()

const plural = (n: number, forms: [string, string, string]) => {
  const ten = n % 10
  const hundred = n % 100
  if (ten === 1 && hundred !== 11) return forms[0]
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return forms[1]
  return forms[2]
}

const summary = computed(() => {
  const views = `${props.total.toLocaleString('ru')} ${plural(props.total, ['просмотр', 'просмотра', 'просмотров'])}`
  const chapters = `${props.rows.length} ${plural(props.rows.length, ['главе', 'главах', 'главах'])}`
  return `${views} в ${chapters}`
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
      <div class="modal" role="dialog" aria-modal="true" aria-label="Просмотры сегодня">
        <button class="close" type="button" aria-label="Закрыть" @click="emit('close')">×</button>

        <p class="modal-title">Просмотры сегодня</p>
        <p class="modal-note">{{ summary }}</p>

        <div class="rows thin-scroll">
          <div v-for="r in rows" :key="r.id" class="row">
            <span class="row-id">{{ r.id }}</span>
            <span class="row-title" :class="{ gone: !r.title }">{{ r.title ?? 'глава снята с сайта' }}</span>
            <span class="row-num">{{ r.views.toLocaleString('ru') }}</span>
          </div>
          <p v-if="!rows.length" class="empty">Сегодня глав ещё не открывали</p>
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
