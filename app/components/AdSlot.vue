<script setup lang="ts">
defineProps<{
  id: string
}>()
</script>

<template>
  <div class="ad-slot" :data-slot="id">
    <!-- AdSense: заменить содержимое на тег ins.adsbygoogle -->
    <div class="ad-placeholder">
      <span>Реклама</span>
    </div>
  </div>
</template>

<style scoped>
.ad-slot {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.ad-placeholder {
  width: 100%;
  max-width: 728px;
  min-height: 90px;
  background: rgba(43, 30, 22, .04);
  border: 1px dashed rgba(43, 30, 22, .15);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ad-placeholder span {
  font-size: 11px;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--ink-soft);
  opacity: .5;
}
</style>
