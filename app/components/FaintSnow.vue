<script setup lang="ts">
/**
 * Еле заметный фон из снежинок — зимняя пара FaintLeaves, те же места и
 * размеры, чтобы при смене сезона страница не поменяла ритм.
 */
import flake from "~/assets/winter/snowflake.svg";

withDefaults(
  defineProps<{
    /** на пергаменте снежинка должна темнить фон, а не светлить */
    onLight?: boolean;
    /** привязать слой к блоку, а не к окну */
    inFlow?: boolean;
  }>(),
  { onLight: false, inFlow: false },
);

const FLAKES = [
  { x: 4, y: 8, size: 120, rot: -18 },
  { x: 88, y: 14, size: 100, rot: 26 },
  { x: 12, y: 46, size: 84, rot: 34 },
  { x: 92, y: 52, size: 110, rot: -12 },
  { x: 2, y: 78, size: 92, rot: 14 },
  { x: 84, y: 84, size: 82, rot: -30 },
  { x: 46, y: 30, size: 130, rot: 8 },
  { x: 62, y: 68, size: 88, rot: -22 },
];

const style = (f: (typeof FLAKES)[number]) => ({
  left: `${f.x}%`,
  top: `${f.y}%`,
  width: `${f.size}px`,
  transform: `rotate(${f.rot}deg)`,
});
</script>

<template>
  <div
    class="faint-snow"
    :class="{ 'on-light': onLight, 'in-flow': inFlow }"
    aria-hidden="true"
  >
    <img
      v-for="(f, i) in FLAKES"
      :key="i"
      :src="flake"
      alt=""
      :style="style(f)"
      loading="lazy"
      decoding="async"
    />
  </div>
</template>

<style scoped>
/* Закреплён на окне, как и листья: подвижный фон во время чтения тянет взгляд. */
.faint-snow {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.faint-snow.in-flow {
  position: absolute;
}

.faint-snow img {
  position: absolute;
  height: auto;
  /* Как у листьев — на пределе: силуэт угадывается, но в глаза не лезет.
     Контур у снежинки чёткий, поэтому она и при тех же 4% видна не хуже. */
  opacity: 0.04;
}

.faint-snow.on-light img {
  filter: brightness(0.35);
  opacity: 0.05;
}

@media (max-width: 700px) {
  .faint-snow img {
    opacity: 0.027;
  }

  .faint-snow.on-light img {
    opacity: 0.035;
  }
}
</style>
