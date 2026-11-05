<script setup lang="ts">
/** Вкладка «Добавить главу»: загрузка epub. */
// --- Загрузка главы ---
const chapterId = ref("");
const chapterTitle = ref("");
const chapterVolume = ref("");
const chapterDate = ref(new Date().toISOString().slice(0, 10));
const chapterPublished = ref(true);
const epubFile = ref<File | null>(null);
const uploading = ref(false);
const uploadResult = ref("");

const onFile = (e: Event) => {
  const input = e.target as HTMLInputElement;
  epubFile.value = input.files?.[0] ?? null;
};

const uploadChapter = async () => {
  if (
    !epubFile.value ||
    !chapterId.value ||
    !chapterTitle.value ||
    !chapterVolume.value
  ) {
    uploadResult.value = "Заполните все поля";
    return;
  }
  uploading.value = true;
  uploadResult.value = "";
  try {
    const fd = new FormData();
    fd.append("epub", epubFile.value);
    fd.append("id", chapterId.value);
    fd.append("title", chapterTitle.value);
    fd.append("volume", chapterVolume.value);
    fd.append("publishedAt", chapterDate.value);
    fd.append("isPublished", chapterPublished.value ? "1" : "0");
    await $fetch("/api/admin/chapters", { method: "POST", body: fd });
    uploadResult.value = `✓ Глава ${chapterId.value} загружена`;
    chapterId.value = "";
    chapterTitle.value = "";
    chapterVolume.value = "";
    chapterPublished.value = true;
    epubFile.value = null;
  } catch (e: any) {
    uploadResult.value = `Ошибка: ${e.data?.message || e.message}`;
  } finally {
    uploading.value = false;
  }
};
</script>

<template>
  <section class="card card--panel">
    <h2>Загрузить главу (.epub)</h2>
    <div class="field-row">
      <label>ID главы (том.номер)</label>
      <input v-model="chapterId" placeholder="4.21" type="text" />
    </div>
    <div class="field-row">
      <label>Название</label>
      <input v-model="chapterTitle" placeholder="Глава 4.21 · В" type="text" />
    </div>
    <div class="field-row">
      <label>Том</label>
      <input v-model="chapterVolume" placeholder="4" type="number" min="1" />
    </div>
    <div class="field-row">
      <label>Дата публикации</label>
      <input v-model="chapterDate" type="date" />
    </div>
    <div class="field-row">
      <label>Файл .epub</label>
      <input type="file" accept=".epub" @change="onFile" />
    </div>
    <label class="checkbox-row">
      <input v-model="chapterPublished" type="checkbox" />
      <span>Опубликовать сразу (видно всем читателям)</span>
    </label>
    <button
      class="btn btn--primary"
      :disabled="uploading"
      @click="uploadChapter"
    >
      {{ uploading ? "Загружаем..." : "Загрузить" }}
    </button>
    <p v-if="uploadResult" class="result-msg">{{ uploadResult }}</p>
  </section>
</template>

<style scoped src="../assets/css/admin-panel.css"></style>
