<script setup lang="ts">
/**
 * Снег на верхней кромке плашки — зимняя замена CornerLeaves. Тонкий слой по
 * всей кромке, к правому углу сугробик со свисающим краем, у левого — наплыв.
 *
 * Снег лежит поверх кромки, то есть выступает за плашку: родителю нужны
 * position: relative и overflow: visible. Рассчитан на рамку плашек сайта —
 * 1px сверху и справа, 3px акцентом слева.
 */
import run from "~/assets/winter/snow-card.svg";
import left from "~/assets/winter/snow-card-left.svg";
import right from "~/assets/winter/snow-card-right.svg";

const tiles = {
  "--run": `url("${run}")`,
  "--left": `url("${left}")`,
  "--right": `url("${right}")`,
};
</script>

<template>
  <span class="snow-cap" :style="tiles" aria-hidden="true">
    <span class="run" />
    <span class="corner corner--left" />
    <span class="corner corner--right" />
  </span>
</template>

<style scoped>
/* Координаты считаются от внутреннего края рамки: верхняя граница плашки —
   на −1px, левая — на −3px, правая — на −1px. В каждой картинке кромка
   плашки нарисована на своей высоте, отсюда разные top. */
.snow-cap {
  position: absolute;
  inset: 0;
  pointer-events: none;
  filter: drop-shadow(0 1px 1px rgba(70, 50, 30, 0.28));
}

.run,
.corner {
  position: absolute;
  background-repeat: no-repeat;
}

/* Плитка середины: кромка на 7px; концы спрятаны под угловыми кусками. */
.run {
  top: -8px;
  left: 20px;
  right: 60px;
  height: 19px;
  background: var(--run) repeat-x 0 0;
}

/* 44×24, кромка на 12px, угол плашки — на 4px от левого края картинки. */
.corner--left {
  top: -13px;
  left: -7px;
  width: 44px;
  height: 24px;
  background-image: var(--left);
}

/* 124×30, кромка на 14px, угол плашки — на 120px. */
.corner--right {
  top: -15px;
  right: -5px;
  width: 124px;
  height: 30px;
  background-image: var(--right);
}
</style>
