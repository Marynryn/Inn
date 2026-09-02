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

const spineColor = computed(() => {
  const i = Math.trunc(props.volume) % SPINE_COLORS.length
  return SPINE_COLORS[(i + SPINE_COLORS.length) % SPINE_COLORS.length]
})
</script>

<template>
  <div class="volume" :class="{ open: isOpen }">
    <button class="volume-head" @click="emit('toggle')">
      <span class="spine" :style="{ '--spine': spineColor }" aria-hidden="true" />
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
  width: 13px;
  height: 42px;
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
}

/* Золотые накатки, как на переплёте */
.spine::before,
.spine::after {
  content: "";
  position: absolute;
  left: 2px;
  right: 2px;
  height: 3px;
  border-top: 1px solid rgba(201, 160, 46, .62);
  border-bottom: 1px solid rgba(201, 160, 46, .32);
}

.spine::before {
  top: 5px;
}

.spine::after {
  bottom: 5px;
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
