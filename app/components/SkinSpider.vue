<script setup lang="ts">
/**
 * Паучок на нити. Висит в своей дорожке у правого края шапки страницы: шапка
 * оставляет эту полосу пустой (см. .has-spider на странице читателя), и нить
 * опускается не дальше дорожки — поэтому паучок не может закрыть имя или «О себе».
 *
 * Длина нити задана долями высоты дорожки, а не пикселями: дорожка на телефоне
 * короче, и паучок сам укорачивает спуск.
 */
</script>

<template>
  <div class="skin-spider" aria-hidden="true">
    <span class="thread" />
    <svg class="body" viewBox="0 0 40 40">
      <g stroke="#8a80a0" stroke-width="1.7" fill="none" stroke-linecap="round">
        <path d="M16 18 Q8 12 4 16 M16 21 Q7 19 3 24 M16 24 Q8 27 5 33 M17 26 Q12 32 11 38" />
        <path d="M24 18 Q32 12 36 16 M24 21 Q33 19 37 24 M24 24 Q32 27 35 33 M23 26 Q28 32 29 38" />
      </g>
      <ellipse cx="20" cy="15" rx="4.2" ry="3.8" fill="#7a7090" />
      <ellipse cx="20" cy="24" rx="6.5" ry="7.5" fill="#7a7090" />
      <ellipse cx="18" cy="21.5" rx="2" ry="2.6" fill="#b3a8c8" opacity=".8" />
      <circle cx="18.6" cy="14.3" r=".9" fill="#e6dcf5" />
      <circle cx="21.4" cy="14.3" r=".9" fill="#e6dcf5" />
    </svg>
  </div>
</template>

<style scoped>
/* Дорожка: от верха шапки до её низа, шириной с паучка. Качается вся целиком
   от точки крепления — так нить и паучок не расходятся. */
.skin-spider {
  position: absolute;
  top: 0;
  right: 28px;
  bottom: 20px;
  width: 44px;
  z-index: 2;
  pointer-events: none;
  transform-origin: 22px 0;
  animation: sway 5.5s ease-in-out infinite;
}

.thread {
  position: absolute;
  left: 21.5px;
  top: 0;
  width: 1px;
  height: 40%;
  background: linear-gradient(rgba(230, 225, 240, .6), rgba(230, 225, 240, .35));
  animation: drop 11s ease-in-out infinite;
}

/* Паучок висит на конце нити: его верх там же, где кончается нить. Нижняя
   граница спуска — 72% дорожки плюс сам паучок, это всё ещё внутри неё. */
.body {
  position: absolute;
  left: 0;
  top: 40%;
  width: 44px;
  height: 44px;
  margin-top: -6px;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, .5));
  animation: drop-body 11s ease-in-out infinite;
}

@keyframes sway {
  0%, 100% { transform: rotate(-5deg); }
  50% { transform: rotate(5deg); }
}

@keyframes drop {
  0%, 55%, 100% { height: 40%; }
  70%, 85% { height: 72%; }
}

@keyframes drop-body {
  0%, 55%, 100% { top: 40%; }
  70%, 85% { top: 72%; }
}

/* На телефоне шапка — столбиком: аватарка сверху, под ней имя. Дорожка — только
   рядом с аватаркой, и спуск кончается выше имени. */
@media (max-width: 560px) {
  .skin-spider {
    right: 10px;
    bottom: auto;
    height: 180px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skin-spider,
  .thread,
  .body { animation: none; }
}
</style>
