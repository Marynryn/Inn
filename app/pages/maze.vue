<script setup lang="ts">
import type { MazeRunView, MazeState } from "#shared/utils/maze";
import { formatMazeTime } from "#shared/utils/maze";

/**
 * Лабиринт. Пока это проба для админов: сам лабиринт, туман, управление —
 * понять, интересно ли играть и какой нужен размер. Команды и турниры
 * придут следом.
 *
 * Лабиринт дня один на всех, но каждому повёрнут по-своему. Время идёт с
 * нажатия «Начать» и считается сервером; ушёл со страницы — забег продолжится
 * с того же места, а время всё это время шло.
 *
 * Кому лабиринт открыт, решает сервер: остальным /api/maze отвечает 404, и
 * страница говорит, что лабиринта сейчас нет.
 */
useHead({
  title: "Лабиринт · Странствующая Таверна",
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});

const { data: settings } = await useFetch("/api/settings");
// Только в браузере: время забега, которое отдаёт сервер, должно быть свежим
// к той минуте, когда страница его покажет.
const {
  data: state,
  refresh,
  error: loadError,
} = useFetch<MazeState>("/api/maze", { server: false });

/** Забег на поле. Пусто — выбор, что начать. */
const current = ref<MazeRunView | null>(null);
const boardKey = ref(0);
const busy = ref(false);
const error = ref("");
const practiceSize = ref(15);

// Незаконченный забег продолжается сам: время у него всё равно идёт.
watch(
  state,
  (s) => {
    if (!s || current.value) return;
    const open = [s.daily, s.practice].find((r) => r && r.finishedMs === null);
    if (open) show(open);
  },
  { immediate: true },
);

function show(run: MazeRunView) {
  current.value = run;
  boardKey.value++;
}

async function start(
  kind: "daily" | "practice",
  opts: { restart?: boolean } = {},
) {
  busy.value = true;
  error.value = "";
  try {
    const run = await $fetch<MazeRunView>("/api/maze/start", {
      method: "POST",
      body: { kind, size: practiceSize.value, restart: opts.restart },
    });
    show(run);
  } catch (e: any) {
    error.value = e?.data?.message || "Не получилось начать";
  } finally {
    busy.value = false;
  }
}

/** Страница и сервер разошлись — берём забег таким, как его видит сервер. */
async function resync() {
  const id = current.value?.id;
  await refresh();
  const s = state.value;
  const fresh = [s?.daily, s?.practice].find((r) => r?.id === id);
  if (fresh) show(fresh);
  else current.value = null;
}

const playing = computed(
  () => !!current.value && current.value.finishedMs === null,
);
const finishedMs = ref<number | null>(null);
watch(current, (r) => {
  finishedMs.value = r?.finishedMs ?? null;
});

function onFinished(ms: number) {
  finishedMs.value = ms;
  refresh();
}

const runTitle = (r: MazeRunView) =>
  r.kind === "daily"
    ? `Лабиринт дня · ${r.size}×${r.size}`
    : `Тренировка · ${r.size}×${r.size}`;
</script>

<template>
  <div class="page">
    <AppHeader
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />

    <main class="maze-page">
      <template v-if="current">
        <header class="run-head">
          <h1 class="run-title display">{{ runTitle(current) }}</h1>
          <button
            v-if="finishedMs !== null"
            type="button"
            class="btn btn--ghost btn--sm"
            @click="current = null"
          >
            К выбору
          </button>
        </header>

        <MazeBoard
          :key="boardKey"
          :run="current"
          @finished="onFinished"
          @resync="resync"
        />

        <div v-if="finishedMs !== null" class="after">
          <button
            v-if="current.kind === 'practice'"
            type="button"
            class="btn btn--primary"
            :disabled="busy"
            @click="
              practiceSize = current.size;
              start('practice');
            "
          >
            Ещё тренировка {{ current.size }}×{{ current.size }}
          </button>
          <button
            v-else-if="state?.canRestart"
            type="button"
            class="btn btn--primary"
            :disabled="busy"
            @click="start('daily', { restart: true })"
          >
            Пройти заново
          </button>
          <p v-if="error" class="error">{{ error }}</p>
        </div>
      </template>

      <template v-else>
        <header class="intro">
          <div v-if="state" class="eyebrow">Проба для админов</div>
          <h1 class="page-title title">Лабиринт</h1>
          <p v-if="!loadError" class="lead">
            Ночь, метель, в руке фонарь. Видно только то, что рядом, —
            пройденное остаётся на карте. Где светится окошко таверны, известно
            сразу, как до него дойти — нет.
          </p>
        </header>

        <section v-if="loadError" class="card card--panel closed">
          <p>
            {{
              loadError.statusCode === 404
                ? "Лабиринта сейчас нет."
                : "Лабиринт не загрузился — попробуй обновить страницу."
            }}
          </p>
          <NuxtLink to="/" class="btn btn--ghost btn--sm">На главную</NuxtLink>
        </section>

        <div v-else-if="state" class="cards">
          <section class="card card--panel option">
            <SnowCap />
            <h2 class="option-title display">Лабиринт дня</h2>
            <p class="option-lead">
              Сегодня — {{ state.dailySize }}×{{ state.dailySize }}. Один на
              всех, но у каждого повёрнут по-своему: подсказка «сначала налево»
              у соседа не сработает.
            </p>
            <p v-if="state.daily?.finishedMs != null" class="result">
              Пройден за
              <b>{{ formatMazeTime(state.daily.finishedMs) }}</b>
            </p>
            <p v-else class="note">
              Время пойдёт сразу, как нажмёшь «Начать». Зачётный забег — один в
              день.
            </p>
            <div class="actions">
              <button
                v-if="!state.daily"
                type="button"
                class="btn btn--primary"
                :disabled="busy"
                @click="start('daily')"
              >
                Начать
              </button>
              <template v-else-if="state.daily.finishedMs != null">
                <button
                  type="button"
                  class="btn btn--ghost"
                  @click="show(state.daily)"
                >
                  Посмотреть путь
                </button>
                <button
                  v-if="state.canRestart"
                  type="button"
                  class="btn btn--primary"
                  :disabled="busy"
                  @click="start('daily', { restart: true })"
                >
                  Пройти заново
                </button>
              </template>
            </div>
          </section>

          <section class="card card--panel option">
            <SnowCap />
            <h2 class="option-title display">Тренировка</h2>
            <p class="option-lead">
              Новый лабиринт на каждый раз — подобрать размер, на котором
              интересно. Время не идёт в зачёт.
            </p>
            <p v-if="state.practice?.finishedMs != null" class="result">
              Последняя: {{ state.practice.size }}×{{ state.practice.size }} за
              <b>{{ formatMazeTime(state.practice.finishedMs) }}</b>
            </p>
            <div class="actions">
              <label class="size">
                <span class="size-label">Размер</span>
                <select v-model.number="practiceSize" class="select">
                  <option v-for="s in state.practiceSizes" :key="s" :value="s">
                    {{ s }}×{{ s }}
                  </option>
                </select>
              </label>
              <button
                type="button"
                class="btn btn--primary"
                :disabled="busy"
                @click="start('practice')"
              >
                Начать тренировку
              </button>
            </div>
          </section>
        </div>

        <p v-if="error" class="error">{{ error }}</p>
      </template>
    </main>
  </div>
</template>

<style scoped>
/* Зимняя ночь сверху переходит в обычный фон сайта к подвалу. */
.page {
  min-height: 100vh;
  background: linear-gradient(
    180deg,
    #0f1828 0%,
    #141c29 55%,
    var(--bg-dark) 100%
  );
  color: var(--parchment);
  display: flex;
  flex-direction: column;
}

.maze-page {
  flex: 1;
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  padding: 88px 20px 48px;
}

.intro {
  margin-bottom: 28px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ember-soft);
  margin-bottom: 12px;
}

.title {
  margin: 0 0 12px;
}

.lead {
  margin: 0;
  max-width: 640px;
  color: var(--text-muted);
  line-height: 1.6;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.option {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-title {
  margin: 0;
  font-size: 22px;
}

.option-lead,
.note {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.55;
  font-size: 14px;
}

.note {
  font-size: 13px;
}

.result {
  margin: 0;
  font-size: 14px;
}

.result b {
  color: var(--gold);
  font-variant-numeric: tabular-nums;
}

.actions {
  margin-top: auto;
  padding-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
}

.size {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.size-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.55;
}

.select {
  appearance: none;
  background: var(--bg-dark);
  color: var(--parchment);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.select:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

.run-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.run-title {
  margin: 0;
  font-size: 20px;
}

.after {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
}

.closed {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.closed p {
  margin: 0;
}

.error {
  color: var(--danger);
  margin: 12px 0 0;
}
</style>
