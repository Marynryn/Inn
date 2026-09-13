<script setup lang="ts">
/**
 * Огонёк на карточке: клик зажигает или гасит. Кнопка сама останавливает
 * всплытие, чтобы клик по ней не открывал карточку.
 */
defineProps<{
  count: number
  lit: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <button
    class="flame"
    :class="{ lit }"
    type="button"
    :aria-pressed="lit"
    :aria-label="lit ? 'Погасить огонёк' : 'Зажечь огонёк'"
    @click.stop="emit('toggle')"
  >
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2c.6 3.2 2.4 4.9 4.2 6.8C18 10.7 19 12.6 19 15a7 7 0 0 1-14 0c0-2 .8-3.6 2-5 .3 1.5 1 2.5 2 3.2C9 10 9.5 6.5 12 2z" />
      <path class="core" d="M12 22a3.5 3.5 0 0 1-3.5-3.5c0-1.5 1-2.6 2-3.8.5.9 1.2 1.4 2 1.8.3-.9.5-2 .5-3.2 1.6 1.2 2.5 2.8 2.5 4.7A3.5 3.5 0 0 1 12 22z" />
    </svg>
    <span class="num">{{ count }}</span>
  </button>
</template>

<style scoped>
.flame {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 4px 5px;
  border-radius: 999px;
  border: 1px solid rgba(241, 230, 210, .14);
  background: rgba(31, 24, 19, .7);
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: color .15s, border-color .15s, background .15s;
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

.flame.lit {
  color: var(--ember);
  border-color: rgba(214, 136, 62, .6);
  background: rgba(214, 136, 62, .16);
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
