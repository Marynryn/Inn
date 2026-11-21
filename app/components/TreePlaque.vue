<script setup lang="ts">
import type { NameTitle } from "#shared/utils/tree";
import { RARITY_LABEL } from "#shared/utils/tree";

/**
 * Титул с ёлки крупно — карточка в окне ёлки. Сверху подпись в квадратных
 * скобках, как системная строка из книги, посередине сам титул, снизу
 * редкость. Цвет свечения — по редкости: тёплое, ледяное или золотое.
 */
defineProps<{ title: NameTitle; kicker: string }>();
</script>

<template>
  <div class="plaque" :class="`is-${title.rarity}`">
    <span class="plaque-glow" aria-hidden="true" />
    <p class="plaque-kicker">[{{ kicker }}]</p>
    <p class="plaque-title">{{ title.text }}</p>
    <p class="plaque-rarity">{{ RARITY_LABEL[title.rarity] }}</p>
  </div>
</template>

<style scoped>
.plaque {
  --glow: 255, 214, 150;
  --edge: rgba(255, 228, 180, 0.55);
  --ink: #fff3dc;
  position: relative;
  overflow: hidden;
  padding: 16px 18px 14px;
  border: 1px solid var(--edge);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(
      120% 90% at 50% 0%,
      rgba(var(--glow), 0.22),
      transparent 70%
    ),
    rgba(40, 8, 14, 0.45);
  box-shadow:
    0 0 0 3px rgba(var(--glow), 0.08),
    0 0 26px rgba(var(--glow), 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  animation: plaque-in 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
}

.plaque.is-uncommon {
  --glow: 150, 205, 245;
  --edge: rgba(180, 222, 250, 0.6);
  --ink: #e4f4ff;
}

.plaque.is-rare {
  --glow: 255, 205, 90;
  --edge: rgba(250, 215, 120, 0.85);
  --ink: #ffe9a8;
}

/* Блик, что один раз проходит по карточке, — у редкого титула. */
.plaque-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.is-rare .plaque-glow {
  background: linear-gradient(
    105deg,
    transparent 30%,
    rgba(255, 240, 190, 0.35) 50%,
    transparent 70%
  );
  transform: translateX(-100%);
  animation: plaque-shine 1.4s ease 0.5s both;
}

.plaque-kicker {
  position: relative;
  margin: 0 0 6px;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(var(--glow), 0.95);
}

.plaque-title {
  position: relative;
  margin: 0;
  font-family: var(--font-title);
  font-size: 27px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--ink);
  text-shadow:
    0 0 14px rgba(var(--glow), 0.75),
    0 0 30px rgba(var(--glow), 0.35);
  text-wrap: balance;
  overflow-wrap: anywhere;
}

.plaque-title::before {
  content: "[";
}

.plaque-title::after {
  content: "]";
}

.plaque-rarity {
  position: relative;
  display: inline-block;
  margin: 10px 0 0;
  padding: 2px 10px;
  border: 1px solid var(--edge);
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(var(--glow), 1);
}

@keyframes plaque-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.96);
  }
}

@keyframes plaque-shine {
  to {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .plaque,
  .is-rare .plaque-glow {
    animation: none;
  }
}
</style>
