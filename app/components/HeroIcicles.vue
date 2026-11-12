<script setup lang="ts">
/**
 * Сосульки по самому верху hero, под прозрачной шапкой. Над логотипом с
 * названием и над кнопками справа они короткие — до кнопок не достают и
 * ничего не закрывают; длинные висят только в пустой середине.
 *
 * Всё нарисовано плитками (scripts/winter-art.mjs), которые повторяются по
 * ширине, — поэтому ряд одинаково ложится и на телефон, и на широкий экран.
 */
import band from "~/assets/winter/icicles-band.svg";
import long from "~/assets/winter/icicles-long.svg";
import short from "~/assets/winter/icicles-short.svg";

const tiles = {
  "--band": `url("${band}")`,
  "--long": `url("${long}")`,
  "--short": `url("${short}")`,
};
</script>

<template>
  <div class="icicles" :style="tiles" aria-hidden="true">
    <span class="zone zone--start" />
    <span class="zone zone--middle" />
    <span class="zone zone--end" />
    <span class="band" />
  </div>
</template>

<style scoped>
.icicles {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 36px;
  display: flex;
  pointer-events: none;
}

.zone {
  height: 100%;
  background: var(--short) repeat-x 0 0;
}

/* Бургер, огонёк и название — 24…296px слева. */
.zone--start {
  flex: none;
  width: 300px;
}

.zone--middle {
  flex: 1;
  background-image: var(--long);
}

/* «Поддержать» и «Войти» (или аватар) — до 260px от правого края. */
.zone--end {
  flex: none;
  width: 260px;
}

/* Снежная кромка, с которой сосульки свисают: прячет их корни. */
.band {
  position: absolute;
  inset: 0 0 auto;
  height: 9px;
  background: var(--band) repeat-x 0 0;
}

/* На телефоне «Поддержать» спрятана, справа только «Войти» или аватар. */
@media (max-width: 600px) {
  .zone--start {
    width: 270px;
  }

  .zone--end {
    width: 64px;
  }
}
</style>
