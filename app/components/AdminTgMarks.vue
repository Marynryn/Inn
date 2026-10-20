<script setup lang="ts">
/**
 * Кнопки разметки над полем сообщения в телеграм. Оборачивают выделенное, как
 * в самом телеграме; без выделения ставят пару знаков и курсор между ними —
 * дописать слово внутрь. Знаки переводит в HTML сервер, см. telegramMarkup.
 */
const props = defineProps<{ target: HTMLTextAreaElement | null, max: number }>()
const text = defineModel<string>({ required: true })

const marks = [
  { mark: '**', label: 'Ж', title: 'Жирный', cls: 'tg-mark--bold' },
  { mark: '~~', label: 'З', title: 'Зачёркнутый', cls: 'tg-mark--strike' },
  { mark: '||', label: 'Спойлер', title: 'Спойлер', cls: '' },
]

const wrap = async (mark: string) => {
  const el = props.target
  if (!el) return
  const { selectionStart: start, selectionEnd: end } = el
  if (text.value.length + mark.length * 2 > props.max) return
  text.value = text.value.slice(0, start) + mark + text.value.slice(start, end) + mark + text.value.slice(end)
  await nextTick()
  el.focus()
  el.setSelectionRange(start + mark.length, end + mark.length)
}
</script>

<template>
  <div class="tg-marks">
    <button
      v-for="m in marks"
      :key="m.mark"
      class="tg-mark"
      :class="m.cls"
      type="button"
      :title="m.title"
      @mousedown.prevent
      @click="wrap(m.mark)"
    >
      {{ m.label }}
    </button>
  </div>
</template>

<style scoped>
.tg-marks {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.tg-mark {
  min-width: 30px;
  padding: 4px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--fill);
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 12px;
  cursor: pointer;
}

.tg-mark:hover { border-color: var(--ember-soft); }
.tg-mark--bold { font-weight: 700; }
.tg-mark--strike { text-decoration: line-through; }
</style>
