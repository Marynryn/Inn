<script setup lang="ts">
/**
 * Ёлка — картинки из public/tree.
 *
 * В баннере (presents) — ёлка с подарками у ствола. В окне их две, друг на
 * друге: ровная (та же, с подарками) стоит, пока ёлку не тронули, а с первого
 * удара её сменяет растрёпанная, что «трясётся». Обе грузятся сразу, чтобы
 * подмена не мигала пустым местом. Картинки неподвижны — качает обёртка
 * снаружи, целиком.
 */
withDefaults(defineProps<{ presents?: boolean; shaking?: boolean }>(), {
  presents: false,
  shaking: false,
});
</script>

<template>
  <img
    v-if="presents"
    class="tree-art"
    src="/tree/tree-banner.webp"
    width="360"
    height="588"
    alt="Новогодняя ёлка"
    draggable="false"
    decoding="async"
  />
  <span v-else class="tree-box" :class="{ 'is-shaking': shaking }">
    <img
      class="tree-img still"
      src="/tree/tree-banner.webp"
      width="360"
      height="588"
      alt="Новогодняя ёлка"
      draggable="false"
    />
    <img
      class="tree-img shook"
      src="/tree/tree-shake.webp"
      width="600"
      height="840"
      alt=""
      draggable="false"
    />
  </span>
</template>

<style scoped>
.tree-art {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
  -webkit-user-drag: none;
}

/* Коробка по пропорциям растрёпанной ёлки; обе картинки — по высоте, низом
   к земле, так что при подмене ёлка не прыгает. */
.tree-box {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 600 / 840;
}

.tree-img {
  position: absolute;
  bottom: 0;
  left: 50%;
  height: 100%;
  width: auto;
  transform: translateX(-50%);
  user-select: none;
  -webkit-user-drag: none;
}

.shook,
.is-shaking .still {
  visibility: hidden;
}

.is-shaking .shook {
  visibility: visible;
}
</style>
