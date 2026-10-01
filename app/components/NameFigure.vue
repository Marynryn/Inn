<script setup lang="ts">
import type { NameFigure } from '#shared/utils/nameFigures'

/**
 * Фигурка у имени. Размер — от шрифта имени, поэтому одна и та же фигурка
 * подходит и мелкой подписи под комментарием, и крупному имени на странице.
 * Кто попросил систему уменьшить движение, видит неподвижный первый кадр.
 */
defineProps<{ figure: NameFigure }>()
</script>

<template>
  <picture class="name-figure" :title="figure.name">
    <source media="(prefers-reduced-motion: reduce)" :srcset="figure.still">
    <img :src="figure.url" :alt="figure.name" width="96" height="96" loading="lazy" decoding="async" draggable="false">
  </picture>
</template>

<style scoped>
.name-figure {
  display: inline-flex;
  flex: none;
  vertical-align: -0.35em;
  margin-left: 0.3em;
}

.name-figure img {
  width: 1.5em;
  height: 1.5em;
  object-fit: contain;
}
</style>
