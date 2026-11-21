<script setup lang="ts">
/**
 * Подарок из-под ёлки — картинки из public/tree. Закрытый ждёт, пока по нему
 * нажмут; открытый подпрыгивает, а слово показывает окно над коробкой.
 * Золотой — подарок с редким словом: виден ещё до того, как его открыли.
 *
 * Обе картинки стоят друг на друге с самого начала: открытая уже загружена,
 * и при нажатии коробка не мигает пустым местом.
 */
const props = defineProps<{ tone: number; rare: boolean; open: boolean }>();

const TONES = ["red", "green", "blue"] as const;

const tone = computed(() =>
  props.rare ? "gold" : TONES[props.tone % TONES.length]!,
);
</script>

<template>
  <span class="gift" :class="{ 'is-open': open, 'is-rare': rare }">
    <span v-if="rare" class="gift-glow" aria-hidden="true" />
    <img
      class="gift-img closed"
      :src="`/tree/gift-${tone}-closed.webp`"
      width="256"
      height="256"
      alt=""
      draggable="false"
    />
    <img
      class="gift-img opened"
      :src="`/tree/gift-${tone}-open.webp`"
      width="256"
      height="256"
      alt=""
      draggable="false"
    />
  </span>
</template>

<style scoped>
.gift {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
}

.gift-img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
  -webkit-user-drag: none;
  transition: opacity 0.18s ease;
}

.opened {
  opacity: 0;
}

.is-open .closed {
  opacity: 0;
}

.is-open .opened {
  opacity: 1;
  animation: gift-pop 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.4);
}

/* Крышка улетела — коробка чуть подпрыгнула. */
@keyframes gift-pop {
  0% {
    transform: scale(1.12, 0.88);
  }
  55% {
    transform: translateY(-6px) scale(0.96, 1.05);
  }
  100% {
    transform: none;
  }
}

/* Сияние золотого — размытый круг под коробкой. Неподвижное: подарков на
   экране три, и пульс на каждом тратил бы кадры зря. */
.gift-glow {
  position: absolute;
  inset: -30%;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(255, 216, 110, 0.55) 0%,
    rgba(255, 216, 110, 0) 65%
  );
}

@media (prefers-reduced-motion: reduce) {
  .is-open .opened {
    animation: none;
  }
}
</style>
