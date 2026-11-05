<script setup lang="ts">
/** Вкладка «Список глав»: тома, порядок перетаскиванием, правка и удаление. */
// --- Список глав ---
// Свой эндпоинт, с черновиками и полем isPublished: публичный /api/chapters
// отдаёт только опубликованные, кто бы ни спрашивал.
const { data: chaptersData, refresh: refreshChapters } = useFetch(
  "/api/admin/chapters",
);
const chapterList = ref<any[]>([]);
watch(
  chaptersData,
  (v) => {
    if (v) chapterList.value = [...v];
  },
  { immediate: true },
);

const volumeGroups = computed(() => {
  const map = new Map<number, any[]>();
  for (const ch of chapterList.value) {
    if (!map.has(ch.volume)) map.set(ch.volume, []);
    map.get(ch.volume)!.push(ch);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
});

const openVolumes = ref(new Set<number>());
const knownVolumes = ref(new Set<number>());
watch(
  chapterList,
  (list) => {
    const vols = new Set(list.map((c) => c.volume));
    const next = new Set(openVolumes.value);
    // При открытии панели раскрыт только последний том — с ним и работают.
    // Том, появившийся потом (загрузили главу нового тома), раскрываем сразу.
    if (!knownVolumes.value.size) {
      if (vols.size) next.add(Math.max(...vols));
    } else {
      for (const vol of vols) {
        if (!knownVolumes.value.has(vol)) next.add(vol);
      }
    }
    for (const vol of next) {
      if (!vols.has(vol)) next.delete(vol);
    }
    knownVolumes.value = vols;
    openVolumes.value = next;
  },
  { immediate: true },
);
const toggleVolume = (vol: number) => {
  const s = new Set(openVolumes.value);
  s.has(vol) ? s.delete(vol) : s.add(vol);
  openVolumes.value = s;
};

// Drag-and-drop
const dragSrcId = ref<string | null>(null);
const dragSrcVol = ref<number | null>(null);
const dragOverId = ref<string | null>(null);

const onDragStart = (e: DragEvent, ch: any) => {
  dragSrcId.value = ch.id;
  dragSrcVol.value = ch.volume;
  e.dataTransfer!.effectAllowed = "move";
};
const onDragOver = (e: DragEvent, ch: any) => {
  if (ch.volume !== dragSrcVol.value || ch.id === dragSrcId.value) {
    return;
  }
  e.preventDefault();
  dragOverId.value = ch.id;
};
const onDrop = (ch: any) => {
  if (
    !dragSrcId.value ||
    ch.id === dragSrcId.value ||
    ch.volume !== dragSrcVol.value
  ) {
    return;
  }
  const arr = [...chapterList.value];
  const from = arr.findIndex((c) => c.id === dragSrcId.value);
  const to = arr.findIndex((c) => c.id === ch.id);
  arr.splice(to, 0, arr.splice(from, 1)[0]);
  chapterList.value = arr;
};
const onDragEnd = () => {
  dragSrcId.value = null;
  dragSrcVol.value = null;
  dragOverId.value = null;
};

const orderChanged = computed(() => {
  if (!chaptersData.value) return false;
  const currentIds = volumeGroups.value.flatMap(([, chs]) =>
    chs.map((c: any) => c.id),
  );
  return currentIds.some(
    (id, i) => id !== (chaptersData.value as any[])[i]?.id,
  );
});
const savingOrder = ref(false);
const saveOrder = async () => {
  savingOrder.value = true;
  try {
    const ids = volumeGroups.value.flatMap(([, chs]) =>
      chs.map((c: any) => c.id),
    );
    await $fetch("/api/admin/chapters/reorder", {
      method: "PUT",
      body: { ids },
    });
    await refreshChapters();
  } finally {
    savingOrder.value = false;
  }
};

const deletingId = ref<string | null>(null);
const deleteChapter = async (id: string) => {
  if (!confirm(`Удалить главу ${id}? Это действие нельзя отменить.`)) {
    return;
  }
  deletingId.value = id;
  try {
    await $fetch(`/api/admin/chapters/${encodeURIComponent(id)}` as string, {
      method: "DELETE",
    });
    await refreshChapters();
  } finally {
    deletingId.value = null;
  }
};

const editingChapter = ref<{ id: string; title: string } | null>(null);
</script>

<template>
  <section class="card card--panel">
    <div class="card-head">
      <h2>Главы ({{ chapterList.length }})</h2>
      <button
        v-if="orderChanged"
        class="btn btn--sm btn--primary"
        :disabled="savingOrder"
        @click="saveOrder"
      >
        {{ savingOrder ? "Сохраняем..." : "Сохранить порядок" }}
      </button>
    </div>
    <div v-if="chapterList.length === 0" class="empty-hint">Глав пока нет</div>
    <div v-for="[vol, chs] in volumeGroups" :key="vol" class="vol-block">
      <button class="vol-head" @click="toggleVolume(vol)">
        <span
          >Том {{ vol }}
          <span class="vol-count">{{ chs.length }} гл.</span></span
        >
        <span class="vol-chev" :class="{ open: openVolumes.has(vol) }">▸</span>
      </button>
      <div v-show="openVolumes.has(vol)" class="vol-body">
        <div
          v-for="ch in chs"
          :key="ch.id"
          class="chapter-row"
          :class="{
            'drag-over': dragOverId === ch.id,
            dragging: dragSrcId === ch.id,
          }"
          draggable="true"
          @dragstart="onDragStart($event, ch)"
          @dragover="onDragOver($event, ch)"
          @drop="onDrop(ch)"
          @dragend="onDragEnd"
          @dragleave="dragOverId = null"
        >
          <span class="drag-handle" title="Перетащить">⠿</span>
          <span class="chapter-row-id">{{ ch.id }}</span>
          <span class="chapter-row-title">{{ ch.title }}</span>
          <span v-if="!ch.isPublished" class="chapter-row-draft">черновик</span>
          <button
            class="btn btn--sm btn--primary"
            @click.stop="editingChapter = { id: ch.id, title: ch.title }"
          >
            Редактировать
          </button>
          <button
            class="btn btn--icon btn--outline-danger btn-delete"
            title="Удалить"
            :disabled="deletingId === ch.id"
            @click.stop="deleteChapter(ch.id)"
          >
            <span v-if="deletingId === ch.id">...</span>
            <svg v-else width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path
                d="M2 3.5h9M5 3.5V2.3a.8.8 0 0 1 .8-.8h1.4a.8.8 0 0 1 .8.8v1.2M3.5 3.5v7.2a.8.8 0 0 0 .8.8h4.4a.8.8 0 0 0 .8-.8V3.5"
                stroke="currentColor"
                stroke-width="1.1"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M5.3 6v3.5M7.7 6v3.5"
                stroke="currentColor"
                stroke-width="1.1"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Окно правки уходит в <body> (Teleport), а здесь — чтобы у вкладки был
         один корневой элемент: его прячет v-show панели. -->
    <ChapterEditModal
      v-if="editingChapter"
      :chapter-id="editingChapter.id"
      :chapter-title="editingChapter.title"
      @close="editingChapter = null"
      @saved="
        editingChapter = null;
        refreshChapters();
      "
    />
  </section>
</template>

<style scoped src="../assets/css/admin-panel.css"></style>

<style scoped>
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.card-head h2 {
  margin: 0;
}

/* Список глав */
.vol-block {
  border-bottom: 1px solid var(--line-faint);
}

.vol-block:last-child {
  border-bottom: none;
}

.vol-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px;
  background: none;
  border: none;
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.vol-head:hover {
  color: var(--ember-soft);
}

.vol-count {
  font-weight: 400;
  color: var(--ink-soft);
  margin-left: 8px;
  font-size: 12px;
}

.vol-chev {
  font-size: 11px;
  color: var(--ink-soft);
  transition: transform 0.2s;
}

.vol-chev.open {
  transform: rotate(90deg);
}

.vol-body {
  padding-bottom: 6px;
}

.chapter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-radius: var(--radius-sm);
  cursor: grab;
  user-select: none;
  transition: background 0.1s;
}

.chapter-row:hover {
  background: var(--fill);
}

.chapter-row.drag-over {
  background: rgba(214, 136, 62, 0.12);
  outline: 1px solid rgba(214, 136, 62, 0.4);
}

.chapter-row.dragging {
  opacity: 0.4;
}

.drag-handle {
  color: var(--ink-soft);
  font-size: 14px;
  cursor: grab;
  flex: 0 0 auto;
}

.chapter-row-draft {
  font-size: 11px;
  color: var(--ember-soft);
  border: 1px solid rgba(214, 136, 62, 0.3);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  white-space: nowrap;
  flex: 0 0 auto;
}

.btn-delete {
  flex: 0 0 auto;
}
</style>
