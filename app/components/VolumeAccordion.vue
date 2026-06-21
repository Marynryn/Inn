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
  openChapter: [id: string]
  download: [event: MouseEvent, id: string]
}>()
</script>

<template>
  <div class="volume" :class="{ open: isOpen }">
    <button class="volume-head" @click="emit('toggle')">
      <span>
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
          @open="emit('openChapter', $event)"
          @download="emit('download', $event[0], $event[1])"
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
  justify-content: space-between;
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
