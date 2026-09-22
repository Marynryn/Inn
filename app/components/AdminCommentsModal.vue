<script setup lang="ts">
/**
 * Последние комментарии — поверх статистики, а не отдельной вкладкой: это
 * то же число с плитки «Комментариев», только построчно. Сюда заходят
 * посмотреть, о чём пишут, и уйти, а не сидеть подолгу.
 */
type CommentRow = {
  id: number
  body: string
  isSpoiler: boolean | null
  chapterId: string | null
  createdAt: string | null
}

const props = defineProps<{
  rows: CommentRow[]
  total: number
}>()

const emit = defineEmits<{ close: []; refresh: [] }>()

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

const refreshing = ref(false)

const refresh = async () => {
  refreshing.value = true
  emit('refresh')
  // Обновление уходит наверх и возвращается новыми строками; полсекунды
  // «крутится» нужны только чтобы нажатие не осталось без ответа.
  setTimeout(() => { refreshing.value = false }, 500)
}

const plural = (n: number, forms: [string, string, string]) => {
  const ten = n % 10
  const hundred = n % 100
  if (ten === 1 && hundred !== 11) return forms[0]
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return forms[1]
  return forms[2]
}

// На плитке — всё за время жизни сайта, в списке — полсотни последних. Подпись
// называет оба числа, чтобы короткий список не выглядел потерей.
const summary = computed(() => {
  const all = `${props.total.toLocaleString('ru')} ${plural(props.total, ['комментарий', 'комментария', 'комментариев'])} за всё время`
  return props.rows.length < props.total
    ? `${all}; ниже — ${props.rows.length} последних`
    : all
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
      <div class="modal" role="dialog" aria-modal="true" aria-label="Последние комментарии">
        <button class="close" type="button" aria-label="Закрыть" @click="emit('close')">×</button>

        <p class="modal-title">Последние комментарии</p>
        <div class="modal-head">
          <p class="modal-note">{{ summary }}</p>
          <button class="refresh" type="button" :disabled="refreshing" @click="refresh">
            ↻ {{ refreshing ? 'Обновляем…' : 'Обновить' }}
          </button>
        </div>

        <div class="rows thin-scroll">
          <div v-for="c in rows" :key="c.id" class="row">
            <div class="row-meta">
              <span class="row-time">{{ fmtMsk(c.createdAt) }}</span>
              <span v-if="c.isSpoiler" class="row-spoiler">спойлер</span>
              <NuxtLink
                v-if="c.chapterId"
                :href="`/chapter/${encodeURIComponent(slugifyChapterId(c.chapterId))}/comments`"
                class="row-link"
                target="_blank"
              >
                гл. {{ c.chapterId }} ↗
              </NuxtLink>
              <NuxtLink v-else href="/" class="row-link" target="_blank">отзыв о сайте ↗</NuxtLink>
            </div>
            <div class="row-body">{{ c.body }}</div>
          </div>
          <p v-if="!rows.length" class="empty">Комментариев пока нет</p>
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
  width: min(620px, 100%);
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

/* Подпись и «Обновить» — одной строкой; на узком экране кнопка уходит вниз. */
.modal-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin: 4px 0 16px;
}

.modal-note {
  margin: 0;
  font-size: 13px;
  color: var(--ink-soft);
}

.refresh {
  padding: 4px 10px;
  border: 1px solid rgba(241, 230, 210, .15);
  border-radius: 6px;
  background: transparent;
  color: var(--ink-soft);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: border-color .15s, color .15s;
}

.refresh:hover:not(:disabled) {
  border-color: rgba(214, 136, 62, .5);
  color: var(--ember-soft);
}

.refresh:disabled {
  cursor: default;
  opacity: .6;
}

/* Список прокручивается сам, шапка остаётся на месте. */
.rows {
  overflow-y: auto;
  margin: 0 -6px;
  padding: 0 6px;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 0;
  border-top: 1px solid rgba(241, 230, 210, .08);
}

.row:first-child {
  border-top: none;
}

.row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-time {
  font-size: 11px;
  color: var(--ink-soft);
}

.row-spoiler {
  font-size: 11px;
  color: var(--ember-soft);
  font-style: italic;
}

.row-link {
  margin-left: auto;
  font-size: 11px;
  color: var(--ember-soft);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.row-link:hover {
  color: var(--ember);
}

.row-body {
  font-size: 13px;
  line-height: 1.5;
  color: var(--parchment-2);
  opacity: .85;
  word-break: break-word;
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
</style>
