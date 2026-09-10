<script setup lang="ts">
import type { AvatarFrame } from '#shared/utils/avatarFrames'
import { frameScale } from '#shared/utils/avatarFrames'

/**
 * Аватарка с рамкой. Рамка не сжимает аватарку, а ложится поверх и выходит за
 * её края: человек с рамкой должен смотреться нарядно, а не мельче соседа.
 * Место в разметке аватарка занимает то же самое — рамка выходит за него.
 */
const props = withDefaults(defineProps<{
  src?: string | null
  /** Имя — из него берётся буква, когда картинки нет, и подпись для читалки. */
  name?: string | null
  frame?: AvatarFrame | null
  /** Сторона круга в пикселях. */
  size: number
  /** Пустая подпись — когда рядом и так написано, чьё это лицо. */
  alt?: string | null
}>(), { alt: undefined })

const initial = computed(() => (props.name?.trim() || '?')[0]!.toUpperCase())

// Насколько картинка рамки шире вписанной в неё аватарки: у рамки с дыркой в
// 72% ширины кольцо занимает по 19% с каждой стороны.
const scale = computed(() => (props.frame ? frameScale(props.frame.fit) : 1))
</script>

<template>
  <span
    class="ua"
    :style="{ '--ua-size': `${size}px`, '--ua-scale': scale }"
    :class="{ 'ua--framed': Boolean(frame) }"
  >
    <img v-if="src" :src="src" class="ua-pic" :alt="alt ?? name ?? ''">
    <span v-else class="ua-letter display" aria-hidden="true">{{ initial }}</span>
    <img
      v-if="frame"
      :src="frame.url"
      class="ua-frame"
      alt=""
      aria-hidden="true"
      draggable="false"
    >
  </span>
</template>

<style scoped>
/* Сетка в одну клетку: картинка и буква ложатся друг на друга, центр у них
   общий сам собой. Рамка в сетку не входит — см. ниже. */
.ua {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--ua-size);
  height: var(--ua-size);
  flex: 0 0 auto;
  border-radius: 50%;
  line-height: 1;
}

.ua-pic,
.ua-letter {
  grid-area: 1 / 1;
}

.ua-pic {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

/* Цвет и фон буква берёт с самой аватарки — так каждое место на сайте
   оставляет себе свою заглушку, а компонент не спорит с их оформлением. */
.ua-letter {
  font-size: calc(var(--ua-size) * .44);
  font-weight: 600;
}

/*
 * Рамка шире круга и на него наезжает — потому она вынута из потока.
 * Клеткой сетки её ставить нельзя: клетка растянулась бы по рамке, а «сто
 * процентов» у картинки считаются от клетки — и аватарка раздувалась бы вместе
 * с рамкой, вылезая из своего же кружка. Absolute держит клетку в размере
 * аватарки, а рамке даёт выйти за края ровно на столько, на сколько нужно.
 */
.ua-frame {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--ua-size) * var(--ua-scale));
  height: calc(var(--ua-size) * var(--ua-scale));
  transform: translate(-50%, -50%);
  max-width: none;
  pointer-events: none;
  user-select: none;
}
</style>
