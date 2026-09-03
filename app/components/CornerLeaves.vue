<script setup lang="ts">
/**
 * Горсть листьев в углу плашки. Листья намеренно свисают за край — родитель
 * их подрезает, и они читаются лежащими сверху, а не наклеенными внутрь.
 * Родителю нужны position: relative и overflow: hidden.
 */
import mapleRed from '~/assets/leaves/maple-red.svg'
import mapleOrange from '~/assets/leaves/maple-orange.svg'
import mapleAmber from '~/assets/leaves/maple-amber.svg'
import mapleYellow from '~/assets/leaves/maple-yellow.svg'
import mapleLime from '~/assets/leaves/maple-lime.svg'
import mapleGreen from '~/assets/leaves/maple-green.svg'
import oakYellow from '~/assets/leaves/oak-yellow.svg'
import oakLime from '~/assets/leaves/oak-lime.svg'

const props = withDefaults(defineProps<{
  /** угол плашки */
  corner?: 'tr' | 'tl'
  /** на тёмной подложке холодные окрасы читаются лучше тёплых */
  onDark?: boolean
}>(), { corner: 'tr', onDark: false })

// Листья лежат внахлёст: шаг между ними меньше их размера, поэтому края
// заходят друг на друга и горсть читается ворохом, а не выложенным рядом.
// Порядок в разметке решает, кто поверх кого, — идём от дальнего к ближнему,
// чтобы крупный лист у самого угла лёг последним и оказался сверху.
// Первые три свисают с боковой кромки — отрицательный отступ выносит их
// за край, и плашка их подрезает. Дальше горсть идёт по верхней кромке
// от дальнего к ближнему, поэтому ворох огибает угол, а не лежит строкой.
const WARM = [
  { src: mapleYellow, size: 22, rot: 118, top: 60, side: -14 },
  { src: mapleOrange, size: 30, rot: 96,  top: 34, side: -18 },
  { src: mapleAmber,  size: 38, rot: 72,  top: 10, side: -12 },
  { src: mapleRed,    size: 20, rot: -12, top: -10, side: 136 },
  { src: mapleAmber,  size: 24, rot: 48,  top: 2,   side: 116 },
  { src: mapleYellow, size: 42, rot: 10,  top: -18, side: 96 },
  { src: mapleOrange, size: 28, rot: -34, top: 6,   side: 74 },
  { src: oakYellow,   size: 38, rot: 34,  top: -16, side: 52 },
  { src: mapleAmber,  size: 34, rot: -20, top: -2,  side: 30 },
  { src: mapleRed,    size: 52, rot: 16,  top: -22, side: 2 },
]

const COOL = [
  { src: mapleYellow, size: 22, rot: 118, top: 60, side: -14 },
  { src: mapleGreen,  size: 30, rot: 96,  top: 34, side: -18 },
  { src: mapleLime,   size: 38, rot: 72,  top: 10, side: -12 },
  { src: oakYellow,   size: 20, rot: -12, top: -10, side: 136 },
  { src: mapleGreen,  size: 24, rot: 48,  top: 2,   side: 116 },
  { src: mapleLime,   size: 42, rot: 10,  top: -18, side: 96 },
  { src: mapleYellow, size: 28, rot: -34, top: 6,   side: 74 },
  { src: oakLime,     size: 38, rot: 34,  top: -16, side: 52 },
  { src: mapleGreen,  size: 34, rot: -20, top: -2,  side: 30 },
  { src: mapleLime,   size: 52, rot: 16,  top: -22, side: 2 },
]

const leaves = computed(() => props.onDark ? COOL : WARM)

const style = (l: { size: number; rot: number; top: number; side: number }) => ({
  width: `${l.size}px`,
  top: `${l.top}px`,
  [props.corner === 'tr' ? 'right' : 'left']: `${l.side}px`,
  transform: `rotate(${l.rot}deg)`,
})
</script>

<template>
  <span class="corner-leaves" aria-hidden="true">
    <img
      v-for="(l, i) in leaves"
      :key="i"
      :src="l.src"
      alt=""
      :style="style(l)"
      loading="lazy"
      decoding="async"
    >
  </span>
</template>

<style scoped>
.corner-leaves {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.corner-leaves img {
  position: absolute;
  height: auto;
}

/* На узкой плашке все семь слиплись бы в пятно: оставляем три ближних.
   Они лежат в конце разметки, поэтому прячем всё, кроме последних трёх. */
@media (max-width: 600px) {
  .corner-leaves img:nth-last-child(n + 4) {
    display: none;
  }
}
</style>
