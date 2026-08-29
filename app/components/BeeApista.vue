<script setup lang="ts">
// Дым в исходном рисунке вшит намертво и нарисован под тёмный фон — на
// пергаменте он не виден, поэтому его срезали и рисуют здесь.
// Идентификаторы фильтра уникальны на случай, если пчела появится дважды.
const uid = useId()
const filterId = `bee-smoke-${uid}`
const fadeId = `bee-fade-${uid}`
</script>

<template>
  <div class="bee">
    <NuxtImg src="/bee.png" alt="Аписта" title="Аписта" width="232" height="161" format="webp" loading="lazy" />

    <span class="bee-ember" aria-hidden="true" />

    <svg class="bee-smoke" viewBox="0 0 64 128" aria-hidden="true">
      <defs>
        <!-- Фрактальный шум сдвигает пиксели клубов, превращая ровные пятна
             в рваные струйки. Без него это просто размытые кружки. -->
        <filter :id="filterId" x="-60%" y="-25%" width="220%" height="150%">
          <feTurbulence type="fractalNoise" baseFrequency="0.028 0.045" numOctaves="3" seed="11" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="22" xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation="1.2" />
        </filter>

        <!-- Снизу плотнее, кверху сходит на нет -->
        <linearGradient :id="fadeId" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="#3b2f25" stop-opacity=".5" />
          <stop offset=".45" stop-color="#4a3c30" stop-opacity=".3" />
          <stop offset="1" stop-color="#5a4a3c" stop-opacity="0" />
        </linearGradient>
      </defs>

      <g :filter="`url(#${filterId})`">
        <ellipse class="puff puff-1" cx="32" cy="112" rx="5" ry="13" :fill="`url(#${fadeId})`" />
        <ellipse class="puff puff-2" cx="32" cy="112" rx="7" ry="16" :fill="`url(#${fadeId})`" />
        <ellipse class="puff puff-3" cx="32" cy="112" rx="4" ry="11" :fill="`url(#${fadeId})`" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.bee {
  --bee-w: 116px;
  position: relative;
  width: var(--bee-w);
  flex-shrink: 0;
  pointer-events: none;
}

.bee img {
  display: block;
  width: 100%;
  height: auto;
}

/* Уголёк сигареты. Проценты — положение кончика на самой картинке,
   поэтому и он, и дым едут за ней при любом размере. */
.bee-ember {
  position: absolute;
  left: 24.8%;
  top: 27.2%;
  width: calc(var(--bee-w) * .085);
  height: calc(var(--bee-w) * .085);
  margin: calc(var(--bee-w) * -.0425) 0 0 calc(var(--bee-w) * -.0425);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 196, 92, .95), rgba(255, 92, 0, .55) 45%, rgba(255, 92, 0, 0) 72%);
  filter: blur(1.5px);
  animation: bee-ember 3.4s ease-in-out infinite;
}

@keyframes bee-ember {
  0%, 100% { opacity: .45; transform: scale(.85); }
  50% { opacity: 1; transform: scale(1.2); }
}

.bee-smoke {
  position: absolute;
  left: 24.8%;
  top: 27.2%;
  width: calc(var(--bee-w) * .46);
  height: calc(var(--bee-w) * .92);
  /* Сдвиг струйки относительно кончика сигареты — подбирается на глаз.
     Отрицательное значение поднимет её выше. */
  --smoke-dy: 5px;
  transform: translate(-50%, calc(-100% + var(--smoke-dy)));
  overflow: visible;
}

/* Клубы всплывают, растут и тают. Шум в фильтре привязан к системе координат,
   а не к фигуре, поэтому струйки «протекают» сквозь поднимающийся клуб —
   ровно так ведёт себя настоящий дым. */
.puff {
  transform-origin: 32px 112px;
  opacity: 0;
  animation: bee-puff 6.5s linear infinite;
}

.puff-2 {
  animation-duration: 8.2s;
  animation-delay: -3.1s;
}

.puff-3 {
  animation-duration: 7.4s;
  animation-delay: -5.4s;
}

@keyframes bee-puff {
  0% {
    transform: translate(0, 0) scale(.35);
    opacity: 0;
  }
  18% {
    opacity: .85;
  }
  55% {
    transform: translate(3px, -46px) scale(1.15) rotate(6deg);
    opacity: .5;
  }
  100% {
    transform: translate(-4px, -96px) scale(2.1) rotate(-8deg);
    opacity: 0;
  }
}

/* «Меньше движения» — просьба про движение, а не про то, чтобы убрать рисунок:
   вместо трёх всплывающих клубов остаётся один неподвижный. Дым виден, но не
   шевелится — иначе на устройстве с этой настройкой сигарета просто не дымит. */
@media (prefers-reduced-motion: reduce) {
  .bee-ember {
    animation: none;
    opacity: .8;
  }

  .puff {
    animation: none;
  }

  .puff-1,
  .puff-3 {
    display: none;
  }

  .puff-2 {
    opacity: .5;
    transform: translate(2px, -26px) scale(1.5);
  }
}
</style>
