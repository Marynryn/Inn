<script setup lang="ts">
const props = defineProps<{
  url?: string
  title?: string
  text?: string
  /** Вариант для тёмной подложки — страница главы. По умолчанию светлая, как оглавление. */
  onDark?: boolean
}>()

// Тексты редактируются в админке; значения тут — запасные, если настройка пустая.
const heading = computed(() => props.title || 'Не пропусти новую главу')
const body = computed(() => props.text || 'Бот в телеграм-канале присылает уведомление о каждой новой главе сразу после публикации.')
</script>

<template>
  <aside v-if="url" class="tg-cta" :class="{ 'on-dark': onDark }">
    <span class="tg-icon" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M21.5 3.5 2.8 10.7c-.9.35-.88 1.63.03 1.95l4.6 1.6 1.77 5.35c.26.78 1.26.98 1.8.36l2.5-2.85 4.62 3.4c.6.44 1.46.11 1.62-.62l3.2-14.8c.17-.8-.62-1.47-1.44-1.6z" fill="currentColor" opacity=".9"/>
        <path d="m7.43 14.25 9.9-6.9-8.1 8.35z" fill="#2b221c" opacity=".35"/>
      </svg>
    </span>

    <div class="tg-body">
      <p class="tg-title">{{ heading }}</p>
      <p class="tg-sub">{{ body }}</p>
    </div>

    <a :href="url" target="_blank" rel="noopener" class="tg-btn">
      Подписаться <span class="tg-ext">↗</span>
    </a>
  </aside>
</template>

<style scoped>
.tg-cta {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 22px;
  border: 1px solid rgba(43, 30, 22, .14);
  border-left: 3px solid var(--ember);
  border-radius: var(--radius-md);
  background: rgba(214, 136, 62, .06);
}

.tg-icon {
  flex-shrink: 0;
  display: flex;
  color: var(--ember);
}

.tg-body {
  flex: 1;
  min-width: 0;
}

.tg-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}

.tg-sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-soft);
}

.tg-btn {
  flex-shrink: 0;
  padding: 10px 18px;
  border-radius: var(--radius-sm);
  background: var(--ember);
  color: var(--bg-dark);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  transition: background .15s;
  animation: tg-pulse 2.8s ease-out infinite;
}

/* Расходящееся кольцо вместо изменения размера самой кнопки — иначе она
   дёргала бы соседний текст при каждом такте. */
@keyframes tg-pulse {
  0% { box-shadow: 0 0 0 0 rgba(214, 136, 62, .45); }
  65% { box-shadow: 0 0 0 12px rgba(214, 136, 62, 0); }
  100% { box-shadow: 0 0 0 0 rgba(214, 136, 62, 0); }
}

.tg-btn:hover {
  background: var(--ember-soft);
  animation-play-state: paused;
}

/* У кого в системе отключены анимации — не мигаем. */
@media (prefers-reduced-motion: reduce) {
  .tg-btn {
    animation: none;
  }
}

.tg-ext {
  font-size: 11px;
  opacity: .7;
}

/* На тёмной подложке страницы главы */
.tg-cta.on-dark {
  border-color: rgba(241, 230, 210, .14);
  border-left-color: var(--ember);
  background: rgba(241, 230, 210, .04);
}

.on-dark .tg-title {
  color: var(--parchment);
}

.on-dark .tg-sub {
  color: var(--text-muted);
}

@media (max-width: 600px) {
  .tg-cta {
    flex-wrap: wrap;
    gap: 12px;
    padding: 16px 18px;
  }

  .tg-body {
    flex-basis: calc(100% - 38px);
  }

  .tg-btn {
    width: 100%;
    text-align: center;
  }
}
</style>
