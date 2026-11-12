<script setup lang="ts">
/**
 * Снег, лежащий на нижнем краю hero, — там, где ночная картинка переходит в
 * пергамент с оглавлением. Ставится первым в светлую полосу под hero (ей нужен
 * position: relative) и выступает вверх, на картинку: hero режет всё, что
 * вылезает за его края, а снегу надо чуть свисать вниз, на пергамент.
 *
 * Лежит поверх вывески: её цепи уходят под снег.
 */
import ledge from "~/assets/winter/snow-ledge.svg";

const tile = { "--ledge": `url("${ledge}")` };
</script>

<template>
  <span class="snow-ledge" :style="tile" aria-hidden="true" />
</template>

<style scoped>
/* Кромка в плитке — на 16px от её верха. */
.snow-ledge {
  position: absolute;
  top: -16px;
  left: 0;
  right: 0;
  z-index: 3;
  height: 24px;
  background: var(--ledge) repeat-x 0 0;
  filter: drop-shadow(0 1px 1px rgba(70, 50, 30, 0.28));
  pointer-events: none;
}
</style>
