<script setup lang="ts">
/**
 * Книга в правом нижнем углу главы — настройки вида: тема, кегль, высота
 * строки, ширина колонки. Окно по центру, всё применяется на ходу, кнопки
 * «сохранить» нет: настройки сами ложатся в браузер, у вошедшего — на сервер.
 */
import {
  DEFAULT_READER_SETTINGS,
  READER_FONT_SIZES,
  READER_LINE_HEIGHT,
  READER_THEMES,
  READER_THEME_NAMES,
  READER_WIDTH,
  isDefaultReaderSettings,
  type ReaderTheme,
} from '#shared/utils/readerSettings'

const auth = useAuthStore()
const { settings, set, reset } = useReaderSettings()

const open = ref(false)

// Пока окно открыто, книгу не убираем: человек как раз её и открыл.
const { tucked } = useScrollTuck(() => !open.value)

const isDefault = computed(() => isDefaultReaderSettings(settings.value))

const themeOptions = READER_THEMES.map(t => ({ value: t, label: READER_THEME_NAMES[t] }))
const fontOptions = READER_FONT_SIZES.map(n => ({ value: n, label: `${n} pt` }))

// Ползунки шлют строки — приводим к числу здесь, чтобы в состоянии не завёлся
// текст, который потом сравнивали бы с числом.
const onLineHeight = (e: Event) => set({ lineHeight: Number((e.target as HTMLInputElement).value) })
const onWidth = (e: Event) => set({ width: Number((e.target as HTMLInputElement).value) })

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') open.value = false
}

// Прокрутку под окном держим: на телефоне палец, ведущий ползунок, иначе
// уносит за собой главу. useScrollLock вешается на монтирование, а окно
// открывается и закрывается много раз — поэтому руками.
watch(open, (isOpen) => {
  if (!import.meta.client) return
  document.body.style.overflow = isOpen ? 'hidden' : ''
  if (isOpen) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  if (!import.meta.client) return
  document.removeEventListener('keydown', onKeydown)
  if (open.value) document.body.style.overflow = ''
})
</script>

<template>
  <div class="reader-settings" :class="{ tucked, 'above-orb': auth.isAuthed }">
    <button
      class="book-btn"
      type="button"
      title="Настройки вида"
      aria-label="Настройки вида"
      @click="open = true"
    >
      <NuxtImg src="/reader-book.webp" class="book" width="167" height="210" alt="" />
    </button>
  </div>

  <Teleport to="body">
    <Transition name="rs-modal">
      <!-- Подложка прозрачная: она только ловит клик мимо окна. Затемнение
           здесь врало бы — цвет темы выбирают глазами, и страница под окном
           должна выглядеть ровно так, как после закрытия. -->
      <div v-if="open" class="rs-backdrop" @click.self="open = false">
        <div class="rs-modal thin-scroll" role="dialog" aria-modal="true" aria-labelledby="rs-title">
          <div class="rs-head">
            <h2 id="rs-title" class="rs-title">Настройки</h2>
            <button class="rs-close" type="button" aria-label="Закрыть" @click="open = false">×</button>
          </div>

          <div class="rs-field">
            <span class="rs-label">Тема</span>
            <ReaderSelect
              label="Тема"
              :model-value="settings.theme"
              :options="themeOptions"
              @update:model-value="v => set({ theme: v as ReaderTheme })"
            />
          </div>

          <div class="rs-field">
            <span class="rs-label">Текст</span>
            <ReaderSelect
              label="Текст"
              :model-value="settings.fontSize"
              :options="fontOptions"
              @update:model-value="v => set({ fontSize: Number(v) })"
            />
          </div>

          <label class="rs-field">
            <span class="rs-label">
              Высота строки
              <span class="rs-value">{{ settings.lineHeight.toFixed(2) }}</span>
            </span>
            <input
              class="rs-range"
              type="range"
              :min="READER_LINE_HEIGHT.min"
              :max="READER_LINE_HEIGHT.max"
              :step="READER_LINE_HEIGHT.step"
              :value="settings.lineHeight"
              @input="onLineHeight"
            >
          </label>

          <!-- Ширину прячем на телефоне: там колонка всегда во всё окно (тот же
               порог 600px, что и в стилях главы), и ползунок ничего бы не делал. -->
          <label class="rs-field rs-field--width">
            <span class="rs-label">
              Ширина
              <span class="rs-value">{{ settings.width }} %</span>
            </span>
            <input
              class="rs-range"
              type="range"
              :min="READER_WIDTH.min"
              :max="READER_WIDTH.max"
              :step="READER_WIDTH.step"
              :value="settings.width"
              @input="onWidth"
            >
          </label>

          <div class="rs-actions">
            <button class="rs-reset" type="button" :disabled="isDefault" @click="reset">
              По умолчанию
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.reader-settings {
  position: fixed;
  right: 18px;
  /* Над жест-баром телефона, как и шар уведомлений. */
  bottom: calc(18px + env(safe-area-inset-bottom));
  z-index: 90;
  transition: transform .25s ease, opacity .25s ease;
}

/* У вошедшего в углу стоит шар уведомлений (64px высотой) — книга над ним. */
.reader-settings.above-orb {
  bottom: calc(18px + 64px + 12px + env(safe-area-inset-bottom));
}

.reader-settings.tucked {
  transform: translateX(calc(100% + 18px));
  opacity: 0;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .reader-settings { transition: none; }
}

/* Книга ростом с шар уведомлений (64px) — они стоят в одном углу друг над
   другом, и разный размер читался бы как ошибка. Книга уже шара: ширину
   задаёт её собственная пропорция, ровняем по высоте. */
.book-btn {
  padding: 0;
  border: none;
  background: none;
  line-height: 0;
  cursor: pointer;
  transition: transform .15s;
}

.book-btn:hover { transform: translateY(-2px); }

.book {
  display: block;
  width: auto;
  height: 64px;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, .45));
}
</style>

<!-- Окно телепортировано в body — вне области scoped-стилей компонента. -->
<style>
.rs-backdrop {
  position: fixed;
  inset: 0;
  z-index: 210;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.rs-modal {
  width: min(360px, 100%);
  /* Телефон в альбомной ориентации — экран в 300px высотой: окно должно
     прокручиваться внутри себя, а не обрезаться по кнопке сброса. */
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: var(--radius-md);
  box-shadow: 0 20px 50px rgba(0, 0, 0, .5);
  padding: 20px 24px 22px;
  color: var(--parchment);
  font-family: var(--font-body);
}

.rs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.rs-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--parchment);
}

.rs-close {
  margin-right: -8px;
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.rs-close:hover { color: var(--parchment); }

.rs-field {
  display: block;
  margin-bottom: 16px;
}

.rs-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 12.5px;
  color: var(--parchment-2);
}

.rs-value {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}


/* Ползунок: тонкая дорожка и янтарная ручка, как остальные акценты сайта. */
.rs-range {
  display: block;
  width: 100%;
  margin: 6px 0 0;
  appearance: none;
  background: none;
  cursor: pointer;
}

.rs-range::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 2px;
  background: rgba(241, 230, 210, .2);
}

.rs-range::-moz-range-track {
  height: 3px;
  border-radius: 2px;
  background: rgba(241, 230, 210, .2);
}

.rs-range::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  margin-top: -7.5px;
  border-radius: 50%;
  border: 2px solid var(--bg-dark-2);
  background: var(--ember);
  box-shadow: 0 1px 4px rgba(0, 0, 0, .4);
}

.rs-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--bg-dark-2);
  background: var(--ember);
  box-shadow: 0 1px 4px rgba(0, 0, 0, .4);
}

.rs-range:focus-visible {
  outline: none;
}

.rs-range:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 3px rgba(232, 176, 122, .35);
}

.rs-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.rs-reset {
  background: none;
  border: 1px solid rgba(241, 230, 210, .2);
  color: var(--parchment-2);
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
  transition: border-color .15s, opacity .15s;
}

.rs-reset:hover:not(:disabled) {
  border-color: rgba(241, 230, 210, .4);
}

.rs-reset:disabled {
  opacity: .45;
  cursor: default;
}

/* Телефон: окно во всю ширину с полями, поля покрупнее — по ним попадают
   пальцем, а не курсором. Ширина колонки здесь не настраивается. */
@media (max-width: 600px) {
  .rs-backdrop {
    padding: 16px;
  }

  .rs-modal {
    width: 100%;
    padding: 18px 18px 20px;
  }

  .rs-field--width { display: none; }

  .rs-range { padding: 6px 0; }
}

.rs-modal-enter-active,
.rs-modal-leave-active {
  transition: opacity .18s ease;
}

.rs-modal-enter-active .rs-modal,
.rs-modal-leave-active .rs-modal {
  transition: transform .18s ease;
}

.rs-modal-enter-from,
.rs-modal-leave-to {
  opacity: 0;
}

.rs-modal-enter-from .rs-modal,
.rs-modal-leave-to .rs-modal {
  transform: translateY(10px);
}
</style>
