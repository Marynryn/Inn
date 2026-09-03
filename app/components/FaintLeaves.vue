<script setup lang="ts">
/**
 * Еле заметный фон из листьев. Цвет снимается фильтром, а не отдельными
 * файлами — те же картинки служат и ворохом в углах, и фактурой здесь.
 */
import mapleRed from '~/assets/leaves/maple-red.svg'
import mapleAmber from '~/assets/leaves/maple-amber.svg'
import mapleYellow from '~/assets/leaves/maple-yellow.svg'
import mapleLime from '~/assets/leaves/maple-lime.svg'

withDefaults(defineProps<{
  /** на пергаменте лист должен темнить фон, а не светлить */
  onLight?: boolean
  /** привязать слой к блоку, а не к окну */
  inFlow?: boolean
}>(), { onLight: false, inFlow: false })

// Только клён: у дубовой веточки с жёлудем рваный силуэт, и на такой
// прозрачности он читается пятном, а не листом. Крупные и редкие —
// мелкие тут превращаются в сор.
const LEAVES = [
  { src: mapleRed,    x: 4,  y: 8,  size: 120, rot: -18 },
  { src: mapleAmber,  x: 88, y: 14, size: 100, rot: 26 },
  { src: mapleLime,   x: 12, y: 46, size: 84,  rot: 34 },
  { src: mapleAmber,  x: 92, y: 52, size: 110, rot: -12 },
  { src: mapleYellow, x: 2,  y: 78, size: 92,  rot: 14 },
  { src: mapleLime,   x: 84, y: 84, size: 82,  rot: -30 },
  { src: mapleAmber,  x: 46, y: 30, size: 130, rot: 8 },
  { src: mapleYellow, x: 62, y: 68, size: 88,  rot: -22 },
]

const style = (l: typeof LEAVES[number]) => ({
  left: `${l.x}%`,
  top: `${l.y}%`,
  width: `${l.size}px`,
  transform: `rotate(${l.rot}deg)`,
})
</script>

<template>
  <div
    class="faint-leaves"
    :class="{ 'on-light': onLight, 'in-flow': inFlow }"
    aria-hidden="true"
  >
    <img
      v-for="(l, i) in LEAVES"
      :key="i"
      :src="l.src"
      alt=""
      :style="style(l)"
      loading="lazy"
      decoding="async"
    >
  </div>
</template>

<style scoped>
/* По умолчанию слой закреплён на окне и при прокрутке не едет: подвижный
   фон во время чтения тянет взгляд. Внутри блока — привязывается к нему. */
.faint-leaves {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.faint-leaves.in-flow {
  position: absolute;
}

.faint-leaves img {
  position: absolute;
  height: auto;
  /* Цвет снимается полностью, дальше лист живёт одной лишь светлотой.
     Четыре процента — почти на пределе: силуэт угадывается, но в глаза
     не попадает. Ниже трёх фон пропадает вовсе. */
  filter: grayscale(1) brightness(1.6);
  opacity: .04;
}

/* На пергаменте светлый лист сливается с фоном, поэтому там он темнит. */
.faint-leaves.on-light img {
  filter: grayscale(1) brightness(0.35);
  opacity: .05;
}

/* На телефоне колонка занимает весь экран, и фон уходит прямо под текст.
   Там он должен быть ещё тише. */
@media (max-width: 700px) {
  .faint-leaves img { opacity: .027; }
  .faint-leaves.on-light img { opacity: .035; }
}
</style>
