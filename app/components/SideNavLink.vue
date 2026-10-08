<script setup lang="ts">
// Пункт шторки и колонки админки: значок, подпись, подсветка текущей страницы.
defineProps<{
  to: string
  icon: string
  label: string
  active?: boolean
  accent?: boolean
  compact?: boolean
  /** Точка «есть новое» — без числа, только знак, что туда стоит заглянуть. */
  dot?: boolean
}>()
</script>

<template>
  <NuxtLink
    :to="to"
    class="side-link"
    :class="{ active, accent, compact }"
    :aria-current="active ? 'page' : undefined"
  >
    <NavIcon :name="icon" />
    <span class="side-label">{{ label }}</span>
    <span v-if="dot" class="side-dot" aria-label="есть новое" />
  </NuxtLink>
</template>

<style scoped>
.side-link {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 44px;
  padding: 0 12px;
  border-radius: 6px;
  color: var(--parchment-2);
  font-size: 14px;
  text-decoration: none;
  transition: background .15s, color .15s;
}

.side-link.compact {
  height: 40px;
}

.side-link:hover {
  background: rgba(241, 230, 210, .06);
  color: var(--parchment);
}

.side-link.accent {
  color: var(--ember-soft);
}

.side-link.active {
  background: rgba(214, 136, 62, .14);
  color: var(--ember-soft);
  font-weight: 500;
}

.side-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ember-soft);
  box-shadow: 0 0 6px rgba(214, 136, 62, .7);
}

.side-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
