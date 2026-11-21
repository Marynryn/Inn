<script setup lang="ts">
import type { NameTitle } from "#shared/utils/tree";
import { RARITY_LABEL } from "#shared/utils/tree";

/**
 * Титул с ёлки у имени — в квадратных скобках, как класс в TWI. Цвет — по
 * редкости: обычный — тихий, необычный — ледяной, редкий — золотой. Размер —
 * от шрифта вокруг, как у фигурки: подходит и подписи под комментарием, и
 * крупному имени на странице.
 */
defineProps<{ title: NameTitle }>();
</script>

<template>
  <span
    class="name-title"
    :class="`is-${title.rarity}`"
    :title="`Титул с новогодней ёлки, ${RARITY_LABEL[title.rarity]}`"
    >[{{ title.text }}]</span
  >
</template>

<style scoped>
.name-title {
  font-family: var(--font-title);
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.01em;
  /* Оранжевый — как титулы в самой книге: «[Title – … Obtained!]». */
  color: #ff9900;
  overflow-wrap: anywhere;
}

/* Редкий — тот же цвет, но с золотым свечением вокруг букв. Без анимации:
   титулов на странице много. */
.is-rare {
  text-shadow:
    0 0 6px rgba(255, 200, 70, 0.75),
    0 0 14px rgba(255, 170, 40, 0.4);
}
</style>
