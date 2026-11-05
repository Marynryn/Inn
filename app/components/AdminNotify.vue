<script setup lang="ts">
/** Вкладка «Уведомления»: рассылка о новых главах в телеграм. */
// --- Уведомления в телеграм ---
const runtimeConfig = useRuntimeConfig();
const { data: notifyData, refresh: refreshNotify } =
  useFetch("/api/admin/notify");
const selectedNotifyIds = ref<string[]>([]);
const sendingNotify = ref(false);
const notifyResult = ref("");
const notifyError = ref("");

const pendingChapters = computed(() => notifyData.value?.chapters ?? []);

// После загрузки и после отправки список сам отмечает то, про что ещё не писали.
watch(
  notifyData,
  () => {
    selectedNotifyIds.value = pendingChapters.value.map((c) => c.id);
  },
  { immediate: true },
);

const notifyPreview = computed(() => {
  const byId = new Map(
    (notifyData.value?.chapters ?? []).map((c) => [c.id, c]),
  );
  const picked = selectedNotifyIds.value
    .map((id) => byId.get(id))
    .filter(Boolean) as { id: string; title: string }[];
  return buildChapterNotification(picked, runtimeConfig.public.siteUrl);
});

// Текст сообщения правится прямо перед отправкой. Пока его не трогали, он
// следует за выбором глав; тронули — остаётся твоим, пока не соберёшь заново.
const notifyText = ref("");
const notifyEdited = ref(false);
const notifyTextEl = ref<HTMLTextAreaElement | null>(null);

watch(
  notifyPreview,
  (text) => {
    if (!notifyEdited.value) notifyText.value = text;
  },
  { immediate: true },
);

const rebuildNotifyText = () => {
  notifyEdited.value = false;
  notifyText.value = notifyPreview.value;
};

// Сервер пишет время рассылки в UTC (toISOString) — показываем по Москве,
// иначе рассылка в 12:07 МСК выглядела как 09:07.
const formatNotifyDate = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Europe/Moscow",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "—";

const sendNotify = async () => {
  notifyError.value = "";
  notifyResult.value = "";
  sendingNotify.value = true;
  try {
    const res = await $fetch("/api/admin/notify", {
      method: "POST",
      body: { chapterIds: selectedNotifyIds.value, text: notifyText.value },
    });
    notifyResult.value = `✓ Отправлено в телеграм: ${res.count} гл.`;
    notifyEdited.value = false;
    await refreshNotify();
  } catch (e: any) {
    notifyError.value = e?.data?.message || "Не удалось отправить";
  } finally {
    sendingNotify.value = false;
  }
};
</script>

<template>
  <section class="card card--panel">
    <h2>Уведомления в Telegram</h2>
    <p class="notify-hint">
      Отправляет сообщение прямо сейчас — в любое время и сколько угодно раз.
      Расписание автоматической рассылки от этого не сдвигается: она уходит
      около 12:00 МСК и никогда не приходит читателям ночью.
    </p>

    <p v-if="notifyData && !notifyData.configured" class="form-error">
      Бот не настроен: нет TELEGRAM_BOT_TOKEN или TELEGRAM_CHANNEL_ID.
    </p>
    <p class="notify-last">
      Автоматическая рассылка последний раз:
      {{ formatNotifyDate(notifyData?.lastNotifyAt) }}
    </p>

    <h3 class="notify-sub">Ещё не отправляли ({{ pendingChapters.length }})</h3>
    <div v-if="pendingChapters.length" class="notify-list">
      <label v-for="ch in pendingChapters" :key="ch.id" class="notify-row">
        <input v-model="selectedNotifyIds" type="checkbox" :value="ch.id" />
        <span class="chapter-row-id">{{ ch.id }}</span>
        <span class="chapter-row-title">{{ ch.title }}</span>
      </label>
    </div>

    <div v-if="notifyPreview" class="notify-preview">
      <div class="notify-preview-head">
        <label class="notify-preview-label" for="notify-text"
          >Текст сообщения — можно править</label
        >
        <button
          v-if="notifyEdited"
          class="notify-rebuild"
          type="button"
          @click="rebuildNotifyText"
        >
          Собрать заново
        </button>
      </div>
      <AdminTgMarks
        v-model="notifyText"
        :target="notifyTextEl"
        :max="4096"
        @update:model-value="notifyEdited = true"
      />
      <textarea
        id="notify-text"
        ref="notifyTextEl"
        v-model="notifyText"
        class="notify-preview-text thin-scroll"
        rows="4"
        maxlength="4096"
        @input="notifyEdited = true"
      />
    </div>

    <div v-if="notifyError" class="form-error">{{ notifyError }}</div>
    <button
      class="btn btn--primary"
      :disabled="
        sendingNotify || !selectedNotifyIds.length || !notifyText.trim()
      "
      @click="sendNotify"
    >
      {{
        sendingNotify
          ? "Отправляем..."
          : `Отправить в Telegram (${selectedNotifyIds.length})`
      }}
    </button>
    <p v-if="notifyResult" class="result-msg">{{ notifyResult }}</p>

    <AdminTelegramPost />
  </section>
</template>

<style scoped src="../assets/css/admin-panel.css"></style>

<style scoped>
/* Уведомления */
.notify-hint {
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-soft);
  margin: 0 0 14px;
}

.notify-last {
  font-size: 12px;
  color: var(--parchment-2);
  margin: 0 0 18px;
}

.notify-sub {
  font-size: 13px;
  font-weight: 600;
  color: var(--parchment-2);
  margin: 0 0 8px;
}

.notify-list {
  display: flex;
  flex-direction: column;
  margin-bottom: 14px;
}

.notify-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.notify-row:hover {
  background: var(--fill);
}

.notify-preview {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  margin-bottom: 16px;
}

.notify-preview-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.notify-preview-label {
  font-size: 11px;
  color: var(--ink-soft);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.notify-rebuild {
  padding: 0;
  border: none;
  background: none;
  color: var(--ember-soft);
  font-family: var(--font-body);
  font-size: 12px;
  cursor: pointer;
}

.notify-rebuild:hover {
  text-decoration: underline;
}

/* Поле без рамки и фона — окошко вокруг уже рамка: правится текст там же,
   где раньше только показывался. */
.notify-preview-text {
  display: block;
  width: 100%;
  height: 96px;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  resize: none;
  overflow-y: auto;
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.5;
  color: var(--parchment-2);
  white-space: pre-wrap;
  word-break: break-word;
}

.notify-preview-text:focus-visible {
  outline: none;
}

.notify-preview:focus-within {
  border-color: var(--ember-soft);
}
</style>
