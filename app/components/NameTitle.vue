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
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: rgba(241, 230, 210, 0.78);
  overflow-wrap: anywhere;
}

.is-uncommon {
  color: #a9d3ef;
}

/* Золото — заливкой текста: ровный цвет на мелком шрифте выглядит горчицей,
   а с переливом читается как металл. Без анимации: титулов на странице много. */
.is-rare {
  font-weight: 600;
  color: #e9c766;
  background: linear-gradient(100deg, #f6e3a1 0%, #d9a93a 45%, #f8e7a8 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
</style>
