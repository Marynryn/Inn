<script setup lang="ts">
import type { NameTitle } from "#shared/utils/tree";
import { tierLabel, tierTextStyle } from "#shared/utils/tree";

/**
 * Титул с ёлки крупно — карточка в окне ёлки. Сверху подпись в квадратных
 * скобках, как системная строка из книги, посередине сам титул, снизу
 * редкость. Каждое слово — цветом своей редкости, скобки и свечение
 * карточки — цветом самого сильного слова; у обычного — тёплое.
 */
const props = defineProps<{ title: NameTitle; kicker: string }>();

const WARM = "#ffd9a0";
const cardTone = computed(() => ({
  "--tier": props.title.tier?.color ?? WARM,
}));
</script>

<template>
  <div class="plaque" :class="{ 'has-tier': title.tier }" :style="cardTone">
    <span class="plaque-glow" aria-hidden="true" />
    <p class="plaque-kicker">[{{ kicker }}]</p>
    <p class="plaque-title">
      <span :style="tierTextStyle(title.tier)">[</span
      ><template v-if="title.parts"
        ><template v-for="(p, i) in title.parts" :key="i"
          ><span :style="tierTextStyle(p.tier)">{{ p.text }}</span
          >{{ i < title.parts.length - 1 ? " " : "" }}</template
        ></template
      ><span v-else :style="tierTextStyle(title.tier)">{{ title.text }}</span
      ><span :style="tierTextStyle(title.tier)">]</span>
    </p>
    <p class="plaque-rarity">{{ tierLabel(title.tier) }}</p>
  </div>
</template>

<style scoped>
/* Все оттенки карточки — из одного цвета редкости (--tier). */
.plaque {
  position: relative;
  overflow: hidden;
  padding: 16px 18px 14px;
  border: 1px solid color-mix(in srgb, var(--tier) 70%, transparent);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(
      120% 90% at 50% 0%,
      color-mix(in srgb, var(--tier) 22%, transparent),
      transparent 70%
    ),
    rgba(40, 8, 14, 0.45);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--tier) 8%, transparent),
    0 0 26px color-mix(in srgb, var(--tier) 30%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  animation: plaque-in 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
}

/* Блик, что один раз проходит по карточке, — у титула с редким словом. */
.plaque-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.has-tier .plaque-glow {
  background: linear-gradient(
    105deg,
    transparent 30%,
    rgba(255, 240, 190, 0.3) 50%,
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
  color: var(--tier);
}

.plaque-title {
  position: relative;
  margin: 0;
  font-family: var(--font-title);
  font-size: 27px;
  font-weight: 700;
  line-height: 1.2;
  color: #fff3dc;
  text-shadow:
    0 0 14px color-mix(in srgb, var(--tier) 60%, transparent),
    0 0 30px color-mix(in srgb, var(--tier) 25%, transparent);
  text-wrap: balance;
  overflow-wrap: anywhere;
}

.plaque-rarity {
  position: relative;
  display: inline-block;
  margin: 10px 0 0;
  padding: 2px 10px;
  border: 1px solid color-mix(in srgb, var(--tier) 70%, transparent);
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--tier);
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
  .has-tier .plaque-glow {
    animation: none;
  }
}
</style>
