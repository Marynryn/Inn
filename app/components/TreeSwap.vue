<script setup lang="ts">
import type { NameTitle, TitleSwap, TreeWordKind } from "#shared/utils/tree";
import { tierTextStyle } from "#shared/utils/tree";

/**
 * Надетый титул рядом с выпавшим — приглушённо: это то, что пропадёт. Под ним
 * — что получится, если поставить в него одно слово из нового: каждый вариант
 * — готовый титул, а новое слово в нём светится цветом своей редкости.
 */
defineProps<{ current: NameTitle; swaps: TitleSwap[]; busy: boolean }>();
const emit = defineEmits<{ pick: [slot: TreeWordKind] }>();

const SLOT_AT: Record<TreeWordKind, number> = { adj: 0, noun: 1, tail: 2 };

/** Новое слово светится: с редкостью — её стилем и ярче, обычное — снежным. */
const glow = (tier: TitleSwap["tier"]) =>
  tier
    ? {
        ...tierTextStyle(tier),
        textShadow: `0 0 8px ${tier.color}, 0 0 18px ${tier.color}aa`,
      }
    : {
        color: "#ffffff",
        textShadow:
          "0 0 8px rgba(200, 230, 255, 0.95), 0 0 18px rgba(150, 205, 245, 0.6)",
      };
</script>

<template>
  <div class="swap">
    <p class="swap-now">
      <span class="swap-label">Сейчас</span>
      <NameTitle :title="current" class="swap-title" />
    </p>

    <template v-if="swaps.length">
      <span class="swap-label">или замени слово</span>
      <button
        v-for="s in swaps"
        :key="s.slot"
        class="swap-opt"
        type="button"
        :disabled="busy"
        :aria-label="`Поставить «${s.word}»: ${s.title.text}`"
        @click="emit('pick', s.slot)"
      >
        <span :style="tierTextStyle(s.title.tier)">[</span
        ><template v-for="(p, i) in s.parts" :key="i"
          ><span
            :style="
              i === SLOT_AT[s.slot] ? glow(p.tier) : tierTextStyle(p.tier)
            "
            >{{ p.text }}</span
          >{{ i < s.parts.length - 1 ? " " : "" }}</template
        ><span :style="tierTextStyle(s.title.tier)">]</span>
      </button>
    </template>

    <span class="swap-warn">старый пропадёт насовсем</span>
  </div>
</template>

<style scoped>
.swap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.18);
}

.swap-now {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 2px 8px;
  margin: 0;
}

.swap-label {
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(241, 230, 210, 0.55);
}

.swap-title {
  font-size: 16px;
}

/* Вариант — готовый титул кнопкой. Слова — цветами своих редкостей, скобки —
   цветом самого сильного, новое слово светится. */
.swap-opt {
  width: 100%;
  min-height: 44px;
  padding: 7px 12px;
  border: 1px solid rgba(255, 228, 180, 0.3);
  border-radius: var(--radius-md);
  background: rgba(255, 214, 150, 0.05);
  font-family: var(--font-title);
  font-weight: 700;
  font-size: 16px;
  line-height: 1.3;
  color: rgba(241, 230, 210, 0.85);
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.swap-opt:hover:not(:disabled) {
  border-color: rgba(255, 228, 180, 0.8);
  background: rgba(255, 214, 150, 0.13);
}

.swap-opt:disabled {
  cursor: default;
  opacity: 0.6;
}

.swap-opt:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.swap-warn {
  font-size: 12px;
  color: #ffc9b8;
}
</style>
