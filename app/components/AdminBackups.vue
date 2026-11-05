<script setup lang="ts">
/**
 * Резервные копии во вкладке «Аккаунт». Ночные снимки базы лежат на том же
 * томе Railway, что и сама база, — от потери тома они не спасут. Поэтому
 * главное здесь — кнопка полной копии: её скачивают к себе.
 */
type Snapshot = { file: string; bytes: number };

const { data, error, refresh } = useFetch<{
  keep: number;
  snapshots: Snapshot[];
}>("/api/admin/backups", { server: false });

/** Снимок сейчас — перед рискованным делом (перезаливка глав, чистка) не ждать ночи. */
const snapping = ref(false);
const snapError = ref("");
const snapNow = async () => {
  snapping.value = true;
  snapError.value = "";
  try {
    await $fetch("/api/admin/backups", { method: "POST" });
    await refresh();
  } catch {
    snapError.value = "Снимок не получился — подробности в логе сервера";
  } finally {
    snapping.value = false;
  }
};

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

/** db-2026-11-04T00-43-00-123Z.sqlite.gz → «04.11.2026, 03:43» по Москве. */
const when = (file: string) => {
  const m = /^db-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/.exec(file);
  if (!m) return file;
  const date = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`);
  return date.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
</script>

<template>
  <div class="backups">
    <h2>Резервные копии</h2>
    <p class="backups-hint">
      Полная копия — база и все загруженные файлы (epub, аватарки, рамки, скины,
      картинки барабана) одним zip. Скачивай её к себе время от времени: это
      единственная копия, которая переживёт потерю тома на Railway.
    </p>
    <a class="btn btn--primary" href="/api/admin/backup" download>
      Скачать полную копию
    </a>

    <h3 class="backups-sub">Снимки базы</h3>
    <p class="backups-hint">
      Каждую ночь в 03:43 по Москве — и по кнопке, например перед перезаливкой
      глав.
    </p>
    <button
      class="btn btn--ghost btn--sm"
      type="button"
      :disabled="snapping"
      @click="snapNow"
    >
      {{ snapping ? "Снимаем..." : "Снять снимок сейчас" }}
    </button>
    <p v-if="snapError" class="backups-hint backups-error">{{ snapError }}</p>
    <p v-if="error" class="backups-hint">Список не загрузился</p>
    <p v-else-if="data && !data.snapshots.length" class="backups-hint">
      Пока ни одного.
    </p>
    <ul v-else-if="data" class="backups-list">
      <li v-for="s in data.snapshots" :key="s.file">
        <span>{{ when(s.file) }}</span>
        <span class="backups-size">{{ mb(s.bytes) }}</span>
      </li>
    </ul>
    <p v-if="data?.snapshots.length" class="backups-hint">
      Хранятся последние {{ data.keep }}, на сервере в storage/backups.
    </p>
  </div>
</template>

<style scoped>
.backups h2 {
  font-family: var(--font-display);
  margin: 0 0 8px;
}

.backups-sub {
  font-family: var(--font-display);
  font-size: 1.05rem;
  margin: 24px 0 8px;
}

.backups-hint {
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.5;
  margin: 0 0 12px;
  max-width: 560px;
}

.backups-error {
  color: var(--danger);
  margin-top: 8px;
}

.backups-list {
  list-style: none;
  margin: 12px 0 8px;
  padding: 0;
  max-width: 360px;
}

.backups-list li {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
}

.backups-size {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
