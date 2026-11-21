<script setup lang="ts">
import type { NameTitle } from "#shared/utils/tree";
import { tierLabel, tierTextStyle } from "#shared/utils/tree";

/**
 * Титул с ёлки у имени — в квадратных скобках, как класс в TWI. Каждое слово
 * окрашено своей редкостью: обычное — тихим светлым, остальные — цветом,
 * который им дали в админке (голубое, золотое…). Скобки — цветом самого
 * сильного слова. Размер — от шрифта вокруг, как у фигурки: подходит и подписи
 * под комментарием, и крупному имени на странице.
 */
const props = defineProps<{ title: NameTitle }>();

const label = computed(
  () => `Титул с новогодней ёлки, ${tierLabel(props.title.tier)}`,
);
</script>

<template>
  <span class="name-title" :title="label"
    ><span :style="tierTextStyle(title.tier)">[</span
    ><template v-if="title.parts"
      ><template v-for="(p, i) in title.parts" :key="i"
        ><span :style="tierTextStyle(p.tier)">{{ p.text }}</span
        >{{ i < title.parts.length - 1 ? " " : "" }}</template
      ></template
    ><span v-else :style="tierTextStyle(title.tier)">{{ title.text }}</span
    ><span :style="tierTextStyle(title.tier)">]</span></span
  >
</template>

<style scoped>
.name-title {
  font-family: var(--font-title);
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: rgba(241, 230, 210, 0.78);
  overflow-wrap: anywhere;
}
</style>
