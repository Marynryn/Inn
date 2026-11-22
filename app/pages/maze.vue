<script setup lang="ts">
import type { MazeRunView, MazeState } from "#shared/utils/maze";
import { formatMazeTime } from "#shared/utils/maze";
import type { MazeTeam } from "#shared/utils/mazeTournament";
import { MAZE_TEAMS } from "#shared/utils/mazeTournament";

/**
 * Лабиринт — турнир Гоблинов и Антиниумов. Пять дней, каждый день новый
 * лабиринт, один на всех, но каждому повёрнут по-своему. Очко дня — команде с
 * лучшим временем дня.
 *
 * В турнир вступают кнопкой; команду назначает сервер. Время забега идёт с
 * нажатия «Начать» и считается сервером; ушёл со страницы — забег продолжится
 * с того же места, а время всё это время шло.
 *
 * Кому лабиринт открыт, решает сервер (режим ивента в админке): остальным
 * /api/maze отвечает 404, и страница говорит, что лабиринта сейчас нет.
 */
useHead({
  title: "Лабиринт · Странствующая Таверна",
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});

// Пока ивент закрыт для всех, страницы для читателей нет — настоящая 404, а
// не заглушка с кодом 200. Спрашиваем ещё при отрисовке на сервере.
const { error: closed } = await useFetch("/api/maze/access", {
  key: "maze-access",
});
if (closed.value) {
  throw createError({
    statusCode: 404,
    message: "Страница не найдена",
    fatal: true,
  });
}

const { data: settings } = await useFetch("/api/settings");
// Только в браузере: время забега, которое отдаёт сервер, должно быть свежим
// к той минуте, когда страница его покажет.
const {
  data: state,
  refresh,
  error: loadError,
} = useFetch<MazeState>("/api/maze", { server: false });

const tournament = computed(() => state.value?.tournament ?? null);
const me = computed(() => state.value?.me ?? null);
const today = computed(
  () => tournament.value?.results.find((d) => !d.closed) ?? null,
);

/** Забег на поле. Пусто — табло турнира. */
const current = ref<MazeRunView | null>(null);
const boardKey = ref(0);
const busy = ref(false);
const error = ref("");
const practiceSize = ref(15);
/** Только что вступил — показываем, за какую команду. */
const justJoined = ref<MazeTeam | null>(null);

// Незаконченный забег продолжается сам: время у него всё равно идёт.
watch(
  state,
  (s) => {
    if (!s || current.value) return;
    const open = [s.run, s.practice].find((r) => r && r.finishedMs === null);
    if (open) show(open);
  },
  { immediate: true },
);

function show(run: MazeRunView) {
  current.value = run;
  boardKey.value++;
}

async function act<T>(fn: () => Promise<T>, fail: string): Promise<T | null> {
  busy.value = true;
  error.value = "";
  try {
    return await fn();
  } catch (e: any) {
    error.value = e?.data?.message || fail;
    return null;
  } finally {
    busy.value = false;
  }
}

async function join() {
  const res = await act(
    () => $fetch<{ team: MazeTeam }>("/api/maze/join", { method: "POST" }),
    "Не получилось вступить",
  );
  if (!res) return;
  justJoined.value = res.team;
  await refresh();
}

async function start(kind: "round" | "practice") {
  const run = await act(
    () =>
      $fetch<MazeRunView>("/api/maze/start", {
        method: "POST",
        body: { kind, size: practiceSize.value },
      }),
    "Не получилось начать",
  );
  if (run) {
    justJoined.value = null;
    show(run);
  }
}

/** Страница и сервер разошлись — берём забег таким, как его видит сервер.
 *  Его нет (день турнира закончился) — возвращаемся к табло. */
async function resync() {
  const id = current.value?.id;
  await refresh();
  const s = state.value;
  const fresh = [s?.run, s?.practice].find((r) => r?.id === id);
  if (fresh && fresh.finishedMs === null) show(fresh);
  else {
    current.value = null;
    if (!fresh) error.value = "Этот день турнира закончился — смотри итоги.";
  }
}

const finishedMs = ref<number | null>(null);
watch(current, (r) => {
  finishedMs.value = r?.finishedMs ?? null;
});

function onFinished(ms: number) {
  finishedMs.value = ms;
  refresh();
}

function back() {
  current.value = null;
  refresh();
}

const runTitle = (r: MazeRunView) => {
  if (r.kind === "practice") return `Тренировка · ${r.size}×${r.size}`;
  const t = tournament.value;
  const day = t?.round ? `День ${t.round} из ${t.days}` : "Лабиринт дня";
  return `${day} · ${r.size}×${r.size}`;
};

const eyebrow = computed(() => {
  switch (state.value?.mode) {
    case "off":
      return "Ивент выключен — страницу видят только админы";
    case "admins":
      return "Проба для админов";
    case "ended":
      return "Ивент закончен";
    default:
      return "Зимний ивент";
  }
});

/** Своё время сегодня — лучшее в команде? */
const myBest = computed(() => {
  const run = state.value?.run;
  const team = me.value?.team;
  if (!run || run.finishedMs === null || !team) return false;
  return today.value?.best[team]?.ms === run.finishedMs;
});

const loginHref = "/login?next=/maze";
const teamStyle = (team: MazeTeam) => ({ "--team": MAZE_TEAMS[team].color });
</script>

<template>
  <div class="page">
    <AppHeader
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />

    <main class="maze-page">
      <!-- Забег: поле на весь экран. -->
      <template v-if="current">
        <header class="run-head">
          <h1 class="run-title display">{{ runTitle(current) }}</h1>
          <button
            v-if="finishedMs !== null"
            type="button"
            class="btn btn--ghost btn--sm"
            @click="back"
          >
            {{ current.kind === "practice" ? "К выбору" : "К турниру" }}
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
          <button v-else type="button" class="btn btn--primary" @click="back">
            Смотреть табло
          </button>
          <p v-if="error" class="error">{{ error }}</p>
        </div>
      </template>

      <template v-else>
        <header class="intro">
          <div v-if="state" class="eyebrow">{{ eyebrow }}</div>
          <h1 class="page-title title">Лабиринт</h1>
          <p v-if="!loadError" class="lead">
            Гоблины против Антиниумов. Ночь, метель, в руке фонарь: видно только
            то, что рядом. Где светится окошко таверны, известно сразу, как до
            него дойти — нет.
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

        <div v-else-if="state" class="stack">
          <!-- Только что вступил: за какую команду. -->
          <section
            v-if="justJoined"
            class="card card--panel joined"
            :style="teamStyle(justJoined)"
          >
            <SnowCap />
            <span class="joined-label">Жребий брошен</span>
            <h2 class="joined-team display">
              Ты в команде {{ MAZE_TEAMS[justJoined].of }}!
            </h2>
            <p class="note">
              Команда — до конца турнира. Каждый день лучшее время команды
              борется за очко, так что каждый забег может его принести.
            </p>
          </section>

          <!-- Что сделать сегодня. -->
          <section
            v-if="tournament && !tournament.finished"
            class="card card--panel today"
          >
            <SnowCap />
            <template v-if="!me">
              <h2 class="card-title display">Участвовать</h2>
              <p class="note">
                Вступить в турнир и проходить лабиринт могут вошедшие. Смотреть
                — все.
              </p>
              <div class="actions">
                <NuxtLink :to="loginHref" class="btn btn--primary"
                  >Войти и участвовать</NuxtLink
                >
              </div>
            </template>

            <template v-else-if="!me.canPlay">
              <h2 class="card-title display">Смотреть можно</h2>
              <p class="note">Играть в лабиринт сейчас нельзя.</p>
            </template>

            <template v-else-if="!me.team">
              <h2 class="card-title display">Вступить в турнир</h2>
              <p class="note">
                Команду назначит жребий — на весь турнир: если в командах
                поровну, бросаем монетку, иначе зовём туда, где людей меньше.
                Вступить можно в любой день.
              </p>
              <div class="actions">
                <button
                  type="button"
                  class="btn btn--primary"
                  :disabled="busy"
                  @click="join"
                >
                  Участвовать
                </button>
              </div>
            </template>

            <template v-else-if="!state.run">
              <h2 class="card-title display">
                День {{ tournament.round }} · {{ today?.size }}×{{
                  today?.size
                }}
              </h2>
              <p class="note">
                Время пойдёт сразу, как нажмёшь «Начать», и считается сервером.
                Зачётный забег — один в день.
              </p>
              <div class="actions">
                <button
                  type="button"
                  class="btn btn--primary"
                  :disabled="busy"
                  @click="start('round')"
                >
                  Начать
                </button>
                <span class="team-tag" :style="teamStyle(me.team)"
                  >за {{ MAZE_TEAMS[me.team].of }}</span
                >
              </div>
            </template>

            <template v-else-if="state.run.finishedMs === null">
              <h2 class="card-title display">Забег не окончен</h2>
              <p class="note">Время идёт — фонарь ждёт.</p>
              <div class="actions">
                <button
                  type="button"
                  class="btn btn--primary"
                  @click="show(state.run)"
                >
                  Продолжить
                </button>
              </div>
            </template>

            <template v-else>
              <h2 class="card-title display">
                Твоё время сегодня —
                <span class="gold">{{
                  formatMazeTime(state.run.finishedMs)
                }}</span>
              </h2>
              <p class="note">
                <template v-if="myBest"
                  >Пока это лучшее время {{ MAZE_TEAMS[me.team].of }} за
                  сегодня.</template
                >
                <template v-else
                  >У {{ MAZE_TEAMS[me.team].of }} сегодня есть время
                  быстрее.</template
                >
                {{
                  tournament.nextSize
                    ? `Завтра — лабиринт ${tournament.nextSize}×${tournament.nextSize}.`
                    : "Это последний день турнира."
                }}
              </p>
              <div class="actions">
                <button
                  type="button"
                  class="btn btn--ghost"
                  @click="show(state.run)"
                >
                  Посмотреть путь
                </button>
              </div>
            </template>
          </section>

          <MazeScoreboard
            v-if="tournament"
            :tournament="tournament"
            :my-team="me?.team ?? null"
          />

          <section v-else class="card card--panel">
            <SnowCap />
            <h2 class="card-title display">Турнира пока нет</h2>
            <p class="note">
              Скоро начнётся. Пять дней, каждый день — новый лабиринт.
              <template v-if="me?.isAdmin">
                Начать турнир —
                <NuxtLink to="/admin?tab=maze" class="link"
                  >в админке, вкладка «Лабиринт»</NuxtLink
                >.
              </template>
            </p>
          </section>

          <p v-if="error" class="error">{{ error }}</p>

          <details class="card card--panel rules">
            <summary class="card-title display">Как играть</summary>
            <ul>
              <li>
                Каждый день — новый лабиринт, один на всех. Но у каждого он
                повёрнут по-своему: подсказка «сначала налево» соседу не
                поможет.
              </li>
              <li>
                Зачётный забег — один в день. Время идёт с нажатия «Начать»;
                закрыл страницу — вернёшься на то же место, но время шло.
              </li>
              <li>
                Очко дня — команде с лучшим временем дня, сколько бы в ней ни
                играло. Прошла одна команда — очко ей. Итоги — в полночь по
                Москве.
              </li>
              <li>
                Турнир — {{ tournament?.days ?? 5 }} дней, лабиринт растёт.
                Очков поровну — побеждает команда с меньшей суммой лучших
                времён.
              </li>
              <li>
                Управление: стрелки или WASD, на телефоне — свайпы. По коридору
                фишка идёт сама до развилки.
              </li>
            </ul>
          </details>

          <!-- Тренировка — подобрать размер, только у админов. -->
          <section v-if="me?.isAdmin" class="card card--panel option">
            <h2 class="card-title display">Тренировка</h2>
            <p class="note">
              Новый лабиринт на каждый раз, не в зачёт — только для админов.
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
                class="btn btn--ghost"
                :disabled="busy"
                @click="start('practice')"
              >
                Начать тренировку
              </button>
            </div>
          </section>
        </div>
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
  max-width: 720px;
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
  color: #9fc3e3;
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

.stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.stack > .card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-title {
  margin: 0;
  font-size: 22px;
}

.note {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.55;
  font-size: 14px;
}

.gold {
  color: #ffcf7a;
  font-variant-numeric: tabular-nums;
}

.link {
  color: var(--ember-soft);
}

.result {
  margin: 0;
  font-size: 14px;
}

.result b {
  color: #ffcf7a;
  font-variant-numeric: tabular-nums;
}

.actions {
  padding-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

/* Объявление команды. */
.joined {
  border-color: var(--team);
  background: color-mix(in srgb, var(--team) 10%, var(--bg-dark-2));
  text-align: center;
  align-items: center;
}

.joined-label {
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--team);
}

.joined-team {
  margin: 0;
  font-size: 28px;
  color: var(--team);
}

.team-tag {
  font-size: 13px;
  color: var(--team);
}

.today {
  border-color: rgba(255, 207, 122, 0.3);
}

/* Правила — свёрнуты, открываются по заголовку. */
.rules summary {
  cursor: pointer;
  list-style: none;
}

.rules summary::-webkit-details-marker {
  display: none;
}

.rules summary::after {
  content: " +";
  color: var(--text-muted);
}

.rules[open] summary::after {
  content: " −";
}

.rules ul {
  margin: 6px 0 0;
  padding-left: 18px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.55;
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.option .actions {
  align-items: flex-end;
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
  margin: 0;
}
</style>
