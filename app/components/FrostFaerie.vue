<!--
  Зимой у оглавления вместо Аписты — ледяная фея Айволет: феи и приносят в
  Изрил снег. Картинка та же, что в барабане, вырезанная по контуру
  (public/faerie.webp). Фея парит над линейкой и покачивается, на крыльях
  вспыхивают искорки, с ног осыпается иней, на линейке под ней — тень.

  Всё движение — transform и opacity: телефон не перерисовывает картинку,
  только сдвигает готовые слои. Проценты у искорок и инея — места на самой
  картинке, поэтому они едут за ней при любом размере.
-->
<template>
  <div class="fae">
    <span class="fae-shadow" aria-hidden="true" />

    <div class="fae-body">
      <NuxtImg
        src="/faerie.webp"
        alt="Айволет"
        title="Айволет"
        width="180"
        height="246"
        loading="lazy"
      />

      <span
        v-for="(s, i) in SPARKS"
        :key="`s${i}`"
        class="fae-spark"
        :style="{
          left: `${s.x}%`,
          top: `${s.y}%`,
          animationDelay: `${s.delay}s`,
          '--spark-size': `${s.size}`,
        }"
        aria-hidden="true"
      />

      <span
        v-for="(d, i) in DUST"
        :key="`d${i}`"
        class="fae-dust"
        :style="{
          left: `${d.x}%`,
          top: `${d.y}%`,
          animationDelay: `${d.delay}s`,
          animationDuration: `${d.dur}s`,
        }"
        aria-hidden="true"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/** Искорки на крыльях и в волосах: место в % картинки, задержка, размер. */
const SPARKS = [
  { x: 25, y: 25, delay: 0, size: 1 },
  { x: 18, y: 56, delay: -1.6, size: 0.8 },
  { x: 79, y: 16, delay: -2.7, size: 0.9 },
  { x: 36, y: 12, delay: -0.9, size: 0.7 },
];

/** Иней с ног и с кончика нижнего крыла. */
const DUST = [
  { x: 24, y: 93, delay: 0, dur: 3.2 },
  { x: 36, y: 86, delay: -1.1, dur: 3.8 },
  { x: 9, y: 62, delay: -2.2, dur: 3.5 },
  { x: 28, y: 90, delay: -2.9, dur: 4.1 },
];
</script>

<style scoped>
.fae {
  /* Ширину задаёт страница (--fae-w), по умолчанию 76px. Свою не объявляем,
     иначе она перебила бы ту, что пришла сверху. */
  position: relative;
  width: var(--fae-w, 76px);
  /* Зазор между ступнями и линейкой — фея парит, а не стоит. */
  padding-bottom: 12px;
  flex-shrink: 0;
  pointer-events: none;
}

.fae-body {
  position: relative;
  animation: fae-hover 4.8s ease-in-out infinite;
}

.fae-body img {
  display: block;
  width: 100%;
  height: auto;
}

/* Покачивание: вверх-вниз и чуть набок, как на ветерке. */
@keyframes fae-hover {
  0%,
  100% {
    transform: translateY(0) rotate(-1.5deg);
  }
  50% {
    transform: translateY(-6px) rotate(1.5deg);
  }
}

/* Тень на линейке под ногами: фея поднимается — тень меньше и бледнее. */
.fae-shadow {
  position: absolute;
  left: 18%;
  bottom: 1px;
  width: 52%;
  height: 7px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(70, 120, 190, 0.38),
    rgba(70, 120, 190, 0) 70%
  );
  animation: fae-shadow 4.8s ease-in-out infinite;
}

@keyframes fae-shadow {
  0%,
  100% {
    transform: scaleX(1);
    opacity: 1;
  }
  50% {
    transform: scaleX(0.78);
    opacity: 0.6;
  }
}

/* Четырёхлучевая звёздочка: два узких ромба крест-накрест. */
.fae-spark {
  --s: calc(var(--fae-w, 76px) * 0.16 * var(--spark-size, 1));
  position: absolute;
  width: var(--s);
  height: var(--s);
  margin: calc(var(--s) / -2) 0 0 calc(var(--s) / -2);
  background: radial-gradient(circle, #fff 25%, #c4e6ff 75%);
  clip-path: polygon(
    50% 0,
    56% 44%,
    100% 50%,
    56% 56%,
    50% 100%,
    44% 56%,
    0 50%,
    44% 44%
  );
  opacity: 0;
  animation: fae-spark 3.6s ease-in-out infinite;
}

@keyframes fae-spark {
  0%,
  60%,
  100% {
    opacity: 0;
    transform: scale(0.2) rotate(0deg);
  }
  75% {
    opacity: 1;
    transform: scale(1) rotate(45deg);
  }
}

/* Иней: крупинка отрывается, падает к линейке и тает. */
.fae-dust {
  position: absolute;
  width: 3px;
  height: 3px;
  margin: -1.5px 0 0 -1.5px;
  border-radius: 50%;
  background: #cfe9ff;
  box-shadow: 0 0 3px 1px rgba(80, 140, 215, 0.55);
  opacity: 0;
  animation: fae-dust 3.5s linear infinite;
}

@keyframes fae-dust {
  0% {
    opacity: 0;
    transform: translate(0, 0);
  }
  15% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(-6px, 26px);
  }
}

/* «Меньше движения» — фея висит на месте, искорки горят неподвижно,
   иней не сыплется. */
@media (prefers-reduced-motion: reduce) {
  .fae-body,
  .fae-shadow {
    animation: none;
  }

  .fae-spark {
    animation: none;
    opacity: 0.85;
    transform: rotate(45deg) scale(0.8);
  }

  .fae-dust {
    display: none;
  }
}
</style>
