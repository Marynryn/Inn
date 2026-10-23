<script lang="ts">
// Один форматтер на все строки. toLocaleDateString собирает его заново на
// каждый вызов, а строк в оглавлении сотни — на сервере это была заметная
// доля времени отрисовки главной.
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
</script>

<script setup lang="ts">
const props = defineProps<{
  chapter: {
    id: string
    title: string
    publishedAt: string
    volume: number
  }
  badge: 'new' | 'read' | null
  downloading: boolean
  downloaded: boolean
}>()

const emit = defineEmits<{
  download: [event: MouseEvent, id: string]
}>()

const href = computed(() => `/chapter/${encodeURIComponent(slugifyChapterId(props.chapter.id))}`)
// format() на негодной дате бросает RangeError — одна битая published_at
// уронила бы всё оглавление, поэтому такую дату просто не показываем.
const published = computed(() => {
  const date = new Date(props.chapter.publishedAt)
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date)
})
</script>

<template>
  <div class="row">
    <NuxtLink class="row-link" :href="href">
      <div
        class="seal display"
        :class="{
          'is-new': badge === 'new',
          'is-read': badge === 'read',
          'seal-wide': chapter.id.length > 6,
        }"
      >
        {{ chapter.id }}
      </div>

      <div class="row-body">
        <p class="row-title">{{ chapter.title }}</p>
        <div class="row-meta">
          <span v-if="badge === 'new'" class="tag tag-new">новая</span>
          <span v-else-if="badge === 'read'" class="tag tag-read">прочитано</span>
          <span>{{ published }}</span>
        </div>
      </div>
    </NuxtLink>

    <div class="row-actions">
      <button
        class="icon-btn"
        title="Скачать epub"
        :class="{ 'is-loading': downloading, 'is-done': downloaded }"
        @click="emit('download', $event, chapter.id)"
      >
        <span v-if="downloading" class="spin" />
        <svg v-else width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path v-if="downloaded" d="M3 9l4 4 8-8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path v-else d="M9 2v9M5 8l4 4 4-4M2 15h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 0;
  border-bottom: 1px solid var(--line-on-parchment);
  transition: background .15s;
}

.row:last-child {
  border-bottom: none;
}

.row:has(.row-link:hover) {
  background: rgba(214, 136, 62, .04);
}

.row-link {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.seal {
  flex: 0 0 auto;
  width: 54px;
  height: 54px;
  border-radius: var(--radius-round);
  border: 1.5px solid var(--gold);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  color: var(--moss);
  background: var(--parchment-2);
  text-align: center;
}

.seal.seal-wide {
  font-size: 10px;
  line-height: 1.3;
  word-break: break-word;
  padding: 0 6px;
}

.seal.is-new {
  border-color: var(--ember);
  color: var(--ember);
}

.seal.is-read {
  border-color: var(--moss);
  color: var(--moss);
  background: rgba(81, 105, 79, .08);
}

.row-body {
  flex: 1;
  min-width: 0;
}

.row-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--ink-soft);
}

.tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-weight: 500;
}

.tag-new {
  background: rgba(214, 136, 62, .15);
  color: var(--ember);
}

.tag-read {
  background: rgba(81, 105, 79, .12);
  color: var(--moss);
}

.row-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
}

.spin {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  border-radius: var(--radius-round);
  animation: spin .7s linear infinite;
}
</style>
