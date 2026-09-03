<script setup lang="ts">
import { pluralize } from '~/composables/useVolumes'
const props = defineProps<{
  volume: number
  chapters: any[]
  isOpen: boolean
  downloading: Set<string>
  downloaded: Set<string>
  getBadge: (ch: any) => 'new' | 'read' | null
}>()

const emit = defineEmits<{
  toggle: []
  download: [event: MouseEvent, id: string]
}>()

// Переплёты томов. Цвет берётся из номера тома, а не из его позиции в списке:
// тома идут не подряд (в базе есть первый и четвёртый без второго и третьего),
// поэтому по позиции цвета перетасовались бы, стоит появиться пропущенному тому.
const SPINE_COLORS = [
  '#5d3230', '#3f5a52', '#6b4a2f', '#3f4560',
  '#5d6034', '#7a3b34', '#51694f', '#4a3a5c',
]

// Римская нумерация на корешке. До L с запасом: томов в переводе десяток,
// но правило не должно ломаться, если их станет заметно больше.
const ROMAN: [number, string][] = [
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
]

const roman = computed(() => {
  let left = Math.trunc(props.volume)
  if (!Number.isFinite(left) || left < 1) return ''
  let out = ''
  for (const [value, sign] of ROMAN) {
    while (left >= value) { out += sign; left -= value }
  }
  return out
})

// Кегль зависит от длины номера: «II» и «VIII» поперёк корешка занимают
// вдвое разную ширину, и на одном размере длинный вылез бы за края.
const numSize = computed(() => {
  const n = roman.value.length
  if (n <= 2) return 10
  if (n === 3) return 8.5
  return 7
})

const spineColor = computed(() => {
  const i = Math.trunc(props.volume) % SPINE_COLORS.length
  return SPINE_COLORS[(i + SPINE_COLORS.length) % SPINE_COLORS.length]
})
</script>

<template>
  <div class="volume" :class="{ open: isOpen }">
    <button class="volume-head" @click="emit('toggle')">
      <span class="spine" :style="{ '--spine': spineColor }" aria-hidden="true">
        <span class="spine-num" :style="{ fontSize: `${numSize}px` }">{{ roman }}</span>
      </span>
      <span class="vol-name">
        Том {{ volume }}
        <span class="vol-sub">· {{ chapters.length }} {{ pluralize(chapters.length, 'глава', 'главы', 'глав') }}</span>
      </span>
      <span class="chev">❯</span>
    </button>

    <div class="volume-body-grid">
      <div class="volume-body">
        <ChapterRow
          v-for="ch in chapters"
          :key="ch.id"
          :chapter="ch"
          :badge="getBadge(ch)"
          :downloading="downloading.has(ch.id)"
          :downloaded="downloaded.has(ch.id)"
          @download="(e, id) => emit('download', e, id)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.volume {
  border-bottom: 1px solid rgba(43, 30, 22, .1);
}

.volume:last-child {
  border-bottom: none;
}

.volume-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 0;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--ink);
  text-align: left;
}

.volume-head:hover .chev {
  color: var(--ember);
}

/* Корешок книги. Слева уходит в тень соседа по полке, справа ловит свет —
   на этом перепаде он и читается объёмным, без единой картинки. */
.spine {
  flex: 0 0 auto;
  width: 24px;
  height: 46px;
  border-radius: 2px 2px 1px 1px;
  position: relative;
  background:
    linear-gradient(90deg,
      rgba(0, 0, 0, .36) 0%,
      rgba(255, 255, 255, .13) 26%,
      rgba(255, 255, 255, .02) 62%,
      rgba(0, 0, 0, .30) 100%),
    var(--spine);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .26);
  /* Ось вращения — по нижней кромке: книга поворачивается на том углу,
     которым стоит на полке, а не вокруг своей середины. */
  transform-origin: 50% 100%;
  transition: transform .32s cubic-bezier(.2, .7, .3, 1), box-shadow .32s ease;
}

/* Открытый том вынимают с полки: корешок кренится в зал и ловит уголь по канту */
.volume.open .spine {
  transform: rotate(-9deg) translateY(-2px);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, .26),
    0 0 0 1px rgba(214, 136, 62, .5),
    3px 5px 8px -4px rgba(31, 24, 19, .55);
}

/* Золотые накатки, как на переплёте */
.spine::before,
.spine::after {
  content: "";
  position: absolute;
  left: 4px;
  right: 4px;
  height: 3px;
  border-top: 1px solid rgba(201, 160, 46, .62);
  border-bottom: 1px solid rgba(201, 160, 46, .32);
}

.spine::before {
  top: 4px;
}

.spine::after {
  bottom: 4px;
}

/* Номер лежит поперёк корешка, поэтому корешок и расширен до 24 пикселей:
   в прежние девятнадцать «VIII» не помещалось. */
.spine-num {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-body);
  font-weight: 600;
  letter-spacing: .2px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  color: var(--gold);
  text-shadow: 0 1px 1px rgba(0, 0, 0, .6);
}

.vol-name {
  flex: 1;
}

.vol-sub {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 400;
  color: var(--ink-soft);
  margin-left: 8px;
}

.chev {
  font-size: 26px;
  color: var(--ink-soft);
  transition: transform .35s ease, color .15s;
}

.volume.open .chev {
  transform: rotate(90deg);
}

.volume-body-grid {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows .35s ease;
}

.volume.open .volume-body-grid {
  grid-template-rows: 1fr;
}

.volume-body {
  overflow: hidden;
}
</style>
