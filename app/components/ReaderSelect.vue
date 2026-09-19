<script lang="ts">
/*
  Раскрытый список в окне один: он стоит в потоке и раздвигает окно, так что
  два открытых сразу выгоняли бы кнопку сброса за нижний край.

  Обычный <script>, а не setup: его тело исполняется один раз на модуль, и
  переменная общая для всех полей. В script setup у каждого поля была бы своя.
*/
const openedId = ref<symbol | null>(null)

export type ReaderSelectOption = { value: string | number, label: string }
</script>

<script setup lang="ts">
/**
 * Выпадающий список для окна настроек главы. Свой, а не системный `select`:
 * системный рисуется поверх окна браузера и на узком экране вылезает за его
 * край — список настроек не должен выезжать из модалки.
 *
 * Раскрывается вниз внутри окна, раздвигая то, что ниже: всплывающий слой
 * внутри прокручиваемой модалки обрезался бы её краем.
 */
type Option = ReaderSelectOption

const props = defineProps<{
  /** Подпись поля — она же имя кнопки для скринридера и тестов. */
  label: string
  modelValue: string | number
  options: Option[]
}>()

const emit = defineEmits<{ 'update:modelValue': [string | number] }>()

const id = Symbol('reader-select')
const open = computed(() => openedId.value === id)
const root = ref<HTMLElement | null>(null)

const toggle = () => { openedId.value = open.value ? null : id }
const close = () => { if (open.value) openedId.value = null }

const current = computed(() =>
  props.options.find(o => o.value === props.modelValue)?.label ?? '')

const pick = (value: string | number) => {
  close()
  if (value !== props.modelValue) emit('update:modelValue', value)
}

/** Соседнее значение — для стрелок: список короткий, по нему ходят клавишами. */
const step = (delta: number) => {
  const i = props.options.findIndex(o => o.value === props.modelValue)
  const next = props.options[Math.min(Math.max(i + delta, 0), props.options.length - 1)]
  if (next) emit('update:modelValue', next.value)
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && open.value) {
    // Своё закрытие, и дальше событие не пускаем: иначе Escape заодно закроет
    // и само окно настроек.
    e.stopPropagation()
    close()
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    step(e.key === 'ArrowDown' ? 1 : -1)
  }
}

const onOutside = (e: MouseEvent) => {
  if (open.value && root.value && !root.value.contains(e.target as Node)) close()
}

onMounted(() => document.addEventListener('click', onOutside))

onUnmounted(() => {
  document.removeEventListener('click', onOutside)
  // Окно закрыли с раскрытым списком — в следующий раз оно должно открыться
  // собранным, а не с тем же полем нараспашку.
  close()
})
</script>

<template>
  <div ref="root" class="sel" :class="{ open }" @keydown="onKeydown">
    <button
      class="sel-trigger"
      type="button"
      :aria-label="label"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <span class="sel-value">{{ current }}</span>
      <span class="sel-chevron" aria-hidden="true" />
    </button>

    <div v-if="open" class="sel-list thin-scroll" role="listbox" :aria-label="label">
      <button
        v-for="o in options"
        :key="o.value"
        class="sel-option"
        :class="{ 'is-current': o.value === modelValue }"
        type="button"
        role="option"
        :aria-selected="o.value === modelValue"
        @click="pick(o.value)"
      >
        {{ o.label }}
        <span v-if="o.value === modelValue" class="sel-check" aria-hidden="true">✓</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sel {
  position: relative;
}

.sel-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  background: var(--bg-dark);
  color: var(--parchment);
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-family: var(--font-body);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.sel-trigger:hover,
.sel-trigger:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

/* Раскрытому полю нижний угол не скругляем: оно продолжается списком. */
.sel.open .sel-trigger {
  border-color: var(--ember-soft);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.sel-chevron {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-bottom: 3px;
  border-right: 1.5px solid var(--ember-soft);
  border-bottom: 1.5px solid var(--ember-soft);
  transform: rotate(45deg);
  transition: transform .15s;
}

.sel.open .sel-chevron {
  margin-bottom: -3px;
  transform: rotate(-135deg);
}

/* Список в потоке, а не поверх: окно настроек прокручивается, и всплывающий
   слой обрезался бы его краем. Длинный список (кегль) прокручивается сам. */
.sel-list {
  max-height: 208px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--ember-soft);
  border-top: none;
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  background: var(--bg-dark);
}

.sel-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  background: none;
  border: none;
  color: var(--parchment-2);
  font-family: var(--font-body);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.sel-option:hover,
.sel-option:focus-visible {
  outline: none;
  background: rgba(241, 230, 210, .06);
  color: var(--parchment);
}

.sel-option.is-current {
  color: var(--ember-soft);
}

.sel-check {
  font-size: 12px;
}
</style>
