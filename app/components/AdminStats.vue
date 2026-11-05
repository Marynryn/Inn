<script setup lang="ts">
/** Вкладка «Статистика»: просмотры, читатели, игра, главы. */
// --- Статистика ---
const { data: stats } = useFetch("/api/admin/stats");

// Столбики «разных читателей»: самый высокий день — 64px, остальные от него.
// Пустой день — тонкая полоска, чтобы ряд не выглядел оборванным.
const readerDaysMax = computed(() =>
  Math.max(1, ...(stats.value?.readersByDay ?? []).map((d) => d.count)),
);
const readerBarHeight = (n: number) =>
  n ? Math.max(6, Math.round((n / readerDaysMax.value) * 64)) : 2;
// Плитки-кнопки: у сегодняшних просмотров и у скачиваний за суммой открывается
// список по главам. У скачиваний сумма общая, а список — только за сегодня.
const viewsModal = ref(false);
const downloadsModal = ref(false);
const commentsModal = ref(false);
type StatsSortKey = "order" | "date" | "views" | "downloads";
const statsSort = ref<{ key: StatsSortKey; dir: "asc" | "desc" }>({
  key: "views",
  dir: "desc",
});

const toggleStatsSort = (key: StatsSortKey) => {
  // Повторный клик по той же колонке переворачивает порядок. У новой колонки
  // направление по умолчанию своё: главы читают сверху вниз, числа — от большего.
  statsSort.value =
    statsSort.value.key === key
      ? { key, dir: statsSort.value.dir === "desc" ? "asc" : "desc" }
      : { key, dir: key === "views" || key === "downloads" ? "desc" : "asc" };
};

const statsSortClass = (key: StatsSortKey) => ({
  active: statsSort.value.key === key,
  asc: statsSort.value.key === key && statsSort.value.dir === "asc",
});

const statsQuery = ref("");

const visibleStats = computed(() => {
  const q = statsQuery.value.trim().toLowerCase();
  const rows = (stats.value?.topChapters ?? []).filter(
    (ch) =>
      !q ||
      ch.id.toLowerCase().includes(q) ||
      ch.title.toLowerCase().includes(q),
  );
  const { key, dir } = statsSort.value;
  const sign = dir === "asc" ? 1 : -1;
  return rows.sort((a, b) => {
    // «По номеру» — это порядок глав на сайте, тот самый, что задан перетаскиванием.
    if (key === "order") return (a.sortOrder - b.sortOrder) * sign;
    if (key === "date")
      return (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "") * sign;
    return ((a[key] ?? 0) - (b[key] ?? 0)) * sign;
  });
});

const formatStatsDate = (iso?: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join(".") : "—";

const { data: commentLogs, refresh: refreshLogs } = useFetch(
  "/api/admin/comments",
);
</script>

<template>
  <section class="card card--panel card--wide">
    <h2>Статистика сайта</h2>
    <div class="stats-totals">
      <div class="stat-card">
        <div class="stat-value">
          {{ stats?.totalViews?.toLocaleString("ru") ?? 0 }}
        </div>
        <div class="stat-label">Просмотров глав</div>
      </div>
      <!-- За этими двумя плитками есть что смотреть: сумма раскладывается
         по главам за сегодня. -->
      <button
        class="stat-card stat-card--today stat-card--open"
        type="button"
        @click="viewsModal = true"
      >
        <div class="stat-value">
          {{ stats?.viewsToday?.toLocaleString("ru") ?? 0 }}
        </div>
        <div class="stat-label">Просмотров сегодня</div>
      </button>
      <button
        class="stat-card stat-card--open"
        type="button"
        @click="downloadsModal = true"
      >
        <div class="stat-value">
          {{ stats?.totalDownloads?.toLocaleString("ru") ?? 0 }}
        </div>
        <div class="stat-label">Скачиваний epub</div>
      </button>
      <button
        class="stat-card stat-card--open"
        type="button"
        @click="commentsModal = true"
      >
        <div class="stat-value">
          {{ stats?.totalComments?.toLocaleString("ru") ?? 0 }}
        </div>
        <div class="stat-label">Комментариев</div>
      </button>
    </div>

    <!-- Читатели — строкой, а не пятой плиткой: на этом экране их уже
       четыре, и ещё одна ничего не прибавила бы к пониманию. -->
    <p class="readers-line">
      <span
        >Читателей
        <b>{{ stats?.readers?.total?.toLocaleString("ru") ?? 0 }}</b></span
      >
      <span v-if="stats?.readers?.week" class="readers-new"
        >+{{ stats.readers.week }} за неделю</span
      >
      <span
        >Google {{ stats?.readers?.google ?? 0 }} · Telegram
        {{ stats?.readers?.telegram ?? 0 }}</span
      >
      <span>пишут или играют {{ stats?.readers?.active ?? 0 }}</span>
    </p>

    <!-- Сколько разных людей открывали главы: просмотры считают и повторы,
       а по этому числу видно саму аудиторию. Столбик — день, последний —
       сегодня. Админы и боты сюда не попадают. -->
    <h3 class="stats-sub">Разных читателей за день</h3>
    <div class="daily-readers">
      <div class="daily-readers-today">
        <span class="stat-value">{{ stats?.readersToday ?? 0 }}</span>
        <span class="daily-readers-label">сегодня</span>
      </div>
      <div
        class="daily-readers-bars"
        role="img"
        :aria-label="`Разные читатели за две недели: ${(stats?.readersByDay ?? []).map((d) => d.count).join(', ')}`"
      >
        <div
          v-for="d in stats?.readersByDay ?? []"
          :key="d.day"
          class="daily-readers-bar"
          :class="{
            'is-today': d.day === stats?.readersByDay?.at(-1)?.day,
          }"
          :title="`${d.day.slice(8, 10)}.${d.day.slice(5, 7)} — ${d.count}`"
        >
          <span class="daily-readers-count">{{ d.count || "" }}</span>
          <span
            class="daily-readers-fill"
            :style="{ height: `${readerBarHeight(d.count)}px` }"
          />
          <span class="daily-readers-day">{{ d.day.slice(8, 10) }}</span>
        </div>
      </div>
    </div>

    <!-- Настольная игра: сколько разных людей открывали её страницы и сколько
       партий доиграно. Админы не в счёт. «За 30 дней» у заходов — сумма
       по дням: один и тот же человек в разные дни считается заново. -->
    <h3 class="stats-sub">Настольная игра</h3>
    <div class="game-stats">
      <div class="game-stats-row game-stats-head">
        <span></span>
        <span>Сегодня</span>
        <span>За 30 дней</span>
      </div>
      <div class="game-stats-row">
        <span>Заходили на страницы</span>
        <span>{{
          (stats?.board?.visitorsToday ?? 0).toLocaleString("ru")
        }}</span>
        <span>{{
          (stats?.board?.visitorsMonth ?? 0).toLocaleString("ru")
        }}</span>
      </div>
      <div class="game-stats-row">
        <span>Партий доиграно</span>
        <span>{{
          (stats?.board?.finishedToday ?? 0).toLocaleString("ru")
        }}</span>
        <span>{{
          (stats?.board?.finishedMonth ?? 0).toLocaleString("ru")
        }}</span>
      </div>
    </div>
    <p class="readers-line">
      <span
        >Доиграно за всё время
        <b>{{
          (stats?.board?.finishedTotal ?? 0).toLocaleString("ru")
        }}</b></span
      >
    </p>

    <h3 class="stats-sub">Игра «Кто из таверны»</h3>
    <div class="game-stats">
      <div class="game-stats-row game-stats-head">
        <span></span>
        <span>Сегодня</span>
        <span>За всё время</span>
      </div>
      <div class="game-stats-row">
        <span>Партий</span>
        <span>{{
          (stats?.game?.today?.played ?? 0).toLocaleString("ru")
        }}</span>
        <span>{{
          (stats?.game?.total?.played ?? 0).toLocaleString("ru")
        }}</span>
      </div>
      <div class="game-stats-row">
        <span>Угадано</span>
        <span>{{ (stats?.game?.today?.won ?? 0).toLocaleString("ru") }}</span>
        <span>{{ (stats?.game?.total?.won ?? 0).toLocaleString("ru") }}</span>
      </div>
      <div class="game-stats-row">
        <span>Попыток</span>
        <span>{{
          (stats?.game?.today?.guesses ?? 0).toLocaleString("ru")
        }}</span>
        <span>{{
          (stats?.game?.total?.guesses ?? 0).toLocaleString("ru")
        }}</span>
      </div>
    </div>

    <div class="stats-tablehead">
      <h3 class="stats-sub">
        Главы<span v-if="statsQuery" class="stats-found">
          · найдено {{ visibleStats.length }}</span
        >
      </h3>
      <input
        v-model="statsQuery"
        class="stats-search"
        type="search"
        placeholder="Номер или название"
      />
    </div>
    <div class="stats-table">
      <div class="stats-row stats-head">
        <button
          class="stats-sort"
          :class="statsSortClass('order')"
          @click="toggleStatsSort('order')"
        >
          Глава
        </button>
        <span></span>
        <button
          class="stats-sort stats-sort--date"
          :class="statsSortClass('date')"
          @click="toggleStatsSort('date')"
        >
          Дата
        </button>
        <button
          class="stats-sort stats-sort--num"
          :class="statsSortClass('views')"
          @click="toggleStatsSort('views')"
        >
          Просмотры
        </button>
        <button
          class="stats-sort stats-sort--num"
          :class="statsSortClass('downloads')"
          @click="toggleStatsSort('downloads')"
        >
          Скачивания
        </button>
      </div>
      <div v-for="ch in visibleStats" :key="ch.id" class="stats-row">
        <span class="stats-id">{{ ch.id }}</span>
        <span class="stats-title">{{ ch.title }}</span>
        <span class="stats-date">{{ formatStatsDate(ch.publishedAt) }}</span>
        <span class="stats-views">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              d="M5.5 2C3 2 1 5.5 1 5.5S3 9 5.5 9 10 5.5 10 5.5 8 2 5.5 2z"
              stroke="currentColor"
              stroke-width="1"
            />
            <circle cx="5.5" cy="5.5" r="1.5" fill="currentColor" />
          </svg>
          {{ ch.views?.toLocaleString("ru") }}
        </span>
        <span class="stats-dl">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              d="M5.5 1v7M2 6l3.5 3.5L9 6"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {{ ch.downloads?.toLocaleString("ru") }}
        </span>
      </div>
      <div v-if="!visibleStats.length" class="empty-hint">
        {{ statsQuery ? "Ничего не нашлось" : "Нет данных" }}
      </div>
    </div>

    <TodayByChapterModal
      v-if="viewsModal"
      kind="views"
      :rows="stats?.viewsTodayChapters ?? []"
      :total="stats?.viewsToday ?? 0"
      @close="viewsModal = false"
    />
    <AdminCommentsModal
      v-if="commentsModal"
      :rows="commentLogs ?? []"
      :total="stats?.totalComments ?? 0"
      @refresh="refreshLogs"
      @close="commentsModal = false"
    />
    <TodayByChapterModal
      v-if="downloadsModal"
      kind="downloads"
      :rows="stats?.downloadsTodayChapters ?? []"
      :total="stats?.downloadsToday ?? 0"
      @close="downloadsModal = false"
    />
  </section>
</template>

<style scoped src="../assets/css/admin-panel.css"></style>

<style scoped>
/* Статистика */
.stats-totals {
  display: flex;
  gap: 16px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.stat-card {
  flex: 1;
  min-width: 120px;
  background: var(--fill);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 16px 20px;
}

/* Сегодняшний счётчик — единственный живой на этом экране, остальные копятся
   годами. Подсвечен рамкой, чтобы глаз находил его первым. */
.stat-card--today {
  border-color: rgba(214, 136, 62, 0.35);
  background: rgba(214, 136, 62, 0.07);
}

/* Плитка-кнопка: выглядит как соседние, но нажимается — рамка ярче под
   курсором, этого и достаточно. */
.stat-card--open {
  display: block;
  width: 100%;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.stat-card--open:hover,
.stat-card--open:focus-visible {
  border-color: rgba(214, 136, 62, 0.6);
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--ember-soft);
  font-family: var(--font-display);
}

.stat-label {
  font-size: 12px;
  color: var(--ink-soft);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Строка про читателей идёт сразу под плитками и держится к ним ближе, чем к
   следующему заголовку: это подпись к ним, а не отдельный раздел. */
.readers-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  margin: -18px 0 28px;
  font-size: 13px;
  color: var(--text-muted);
}

.readers-line b {
  color: var(--ember-soft);
  font-weight: 600;
}

.readers-line span + span::before {
  content: "·";
  margin-right: 12px;
  opacity: 0.45;
}

.readers-new {
  color: var(--moss);
}

/* Разные читатели за день: число за сегодня и две недели столбиками. */
.daily-readers {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  margin: 0 0 28px;
}

.daily-readers-today {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.daily-readers-label {
  font-size: 11px;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.daily-readers-bars {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(14, minmax(0, 1fr));
  gap: 4px;
  align-items: end;
}

.daily-readers-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.daily-readers-fill {
  width: 100%;
  max-width: 22px;
  border-radius: 3px 3px 0 0;
  background: var(--ember);
  opacity: 0.45;
}

.daily-readers-bar.is-today .daily-readers-fill {
  opacity: 1;
}

.daily-readers-count,
.daily-readers-day {
  font-size: 10px;
  line-height: 1;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums lining-nums;
}

.stats-sub {
  font-size: 13px;
  font-weight: 600;
  color: var(--parchment-2);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.stats-tablehead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.stats-tablehead .stats-sub {
  margin: 0;
}

.stats-found {
  color: var(--ink-soft);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}

.stats-search {
  background: var(--fill);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  color: var(--parchment);
  padding: 7px 12px;
  font-family: var(--font-body);
  font-size: 13px;
  width: 240px;
  max-width: 100%;
}

.stats-search::placeholder {
  color: var(--ink-soft);
}

.stats-search:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

.stats-table {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 560px;
  overflow-y: auto;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-md);
  scrollbar-width: thin;
  scrollbar-color: rgba(214, 136, 62, 0.3) transparent;
}

.stats-table::-webkit-scrollbar {
  width: 4px;
}

.stats-table::-webkit-scrollbar-track {
  background: transparent;
}

.stats-table::-webkit-scrollbar-thumb {
  background: rgba(214, 136, 62, 0.3);
  border-radius: var(--radius-sm);
}

.stats-table::-webkit-scrollbar-thumb:hover {
  background: rgba(214, 136, 62, 0.6);
}

.stats-row {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 78px 84px 92px;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line-faint);
  font-size: 13px;
}

.stats-head {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-dark-2);
  border-bottom: 1px solid var(--line);
  padding-top: 10px;
  padding-bottom: 10px;
}

.stats-sort {
  background: none;
  border: none;
  padding: 0;
  font-family: var(--font-body);
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ink-soft);
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  transition: color 0.15s;
}

.stats-sort--num {
  text-align: right;
}

.stats-sort:hover {
  color: var(--parchment-2);
}

.stats-sort.active {
  color: var(--ember-soft);
}

/* Стрелка только у активной колонки: ▼ по убыванию, ▲ по возрастанию. */
.stats-sort.active::after {
  content: " ▼";
  font-size: 8px;
}

.stats-sort.active.asc::after {
  content: " ▲";
}

.stats-date {
  color: var(--ink-soft);
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums lining-nums;
}

.stats-id {
  color: var(--ember-soft);
  font-family: var(--font-display);
  font-size: 12px;
}

.stats-title {
  color: var(--parchment-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats-views,
.stats-dl {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  color: var(--parchment);
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums lining-nums;
}

.stats-views svg,
.stats-dl svg {
  opacity: 0.5;
  flex-shrink: 0;
}

@media (max-width: 600px) {
  /* Пять колонок в телефон не влезают: название сжимается в многоточие, а
       подписи счётчиков шире своих ячеек. Строка разворачивается в две линии —
       сверху глава, снизу дата и счётчики. */
  .stats-row {
    grid-template-columns: 46px minmax(0, 1fr) auto auto;
    column-gap: 10px;
    row-gap: 3px;
  }
  .stats-id {
    grid-area: 1 / 1;
  }
  .stats-title {
    grid-area: 1 / 2 / 2 / -1;
    white-space: normal;
  }
  .stats-date {
    grid-area: 2 / 1 / 3 / 3;
  }
  .stats-views {
    grid-area: 2 / 3;
  }
  .stats-dl {
    grid-area: 2 / 4;
  }
  /* Шапка превращается в строку переключателей: сеткой её колонки не совпадут
       с двухэтажными строками ниже. */
  .stats-head {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
  }
  .stats-head > span {
    display: none;
  }
  .stats-sort--num {
    text-align: left;
  }
  .stats-search {
    width: 100%;
  }
  .stats-table {
    max-height: 60dvh;
  }
}

/* ── Счётчики игры ──────────────────────────── */
.game-stats {
  max-width: 460px;
  margin-bottom: 8px;
}

.game-stats-row {
  display: grid;
  grid-template-columns: 1fr 110px 110px;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(42, 30, 22, 0.08);
  font-size: 13px;
}

/* Числа стоят по центру своей колонки — ровно под подписью «Сегодня» и «За всё время». */
.game-stats-row span:not(:first-child) {
  text-align: center;
  font-variant-numeric: tabular-nums lining-nums;
}

.game-stats-head {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
</style>
