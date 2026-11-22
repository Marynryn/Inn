<script setup lang="ts">
import type {
  MazeMode,
  MazeTournamentView,
} from "#shared/utils/mazeTournament";
import {
  MAZE_MODES,
  MAZE_SIZE_MAX,
  MAZE_SIZE_MIN,
  MAZE_TEAMS,
  MAZE_TEAM_IDS,
} from "#shared/utils/mazeTournament";
import { formatMazeTime } from "#shared/utils/maze";

/**
 * Вкладка «Лабиринт»: режим ивента, размеры лабиринта по дням турнира и пульт
 * турнира. «Закончить день сейчас» — для пробы: не ждать полуночи пять раз.
 * «Удалить турнир» — убрать пробный турнир перед запуском для читателей.
 */

type AdminMaze = {
  settings: { mode: MazeMode; sizes: number[] };
  tournament: MazeTournamentView | null;
};

const { data, refresh } = useFetch<AdminMaze>("/api/admin/maze");

const mode = ref<MazeMode>("off");
const sizes = ref<number[]>([11, 13, 15, 17, 19]);
watch(
  () => data.value?.settings,
  (s) => {
    if (!s) return;
    mode.value = s.mode;
    sizes.value = [...s.sizes];
  },
  { immediate: true },
);

const saving = ref(false);
const saveMsg = ref("");
const error = ref("");

const sizesOk = computed(() =>
  sizes.value.every(
    (n) => Number.isInteger(n) && n >= MAZE_SIZE_MIN && n <= MAZE_SIZE_MAX,
  ),
);

async function save() {
  saving.value = true;
  saveMsg.value = "";
  error.value = "";
  try {
    await $fetch("/api/admin/settings", {
      method: "PUT",
      body: { maze_mode: mode.value, maze_sizes: sizes.value.join(",") },
    });
    await refresh();
    saveMsg.value = "Сохранено";
  } catch (e: any) {
    error.value = e?.data?.message || "Не сохранилось";
  } finally {
    saving.value = false;
  }
}

const busy = ref(false);
async function act(fn: () => Promise<unknown>) {
  busy.value = true;
  error.value = "";
  try {
    await fn();
    await refresh();
  } catch (e: any) {
    error.value = e?.data?.message || "Не получилось";
  } finally {
    busy.value = false;
  }
}

const t = computed(() => data.value?.tournament ?? null);
const active = computed(() => !!t.value && !t.value.finished);

const startTournament = () =>
  act(() =>
    $fetch<{ id: number }>("/api/admin/maze/start", { method: "POST" }),
  );

const advance = () => {
  const x = t.value;
  if (!x?.round) return;
  const last = x.round >= x.days;
  if (
    !confirm(
      last
        ? "Закончить последний день сейчас? Турнир закончится, итоги подведутся этой минутой."
        : `Закончить день ${x.round} сейчас? Итоги подведутся этой минутой, день ${x.round + 1} начнётся сразу. Начатые и не пройденные забеги этого дня не засчитаются.`,
    )
  )
    return;
  act(() =>
    $fetch<{ ok: boolean }>("/api/admin/maze/advance", { method: "POST" }),
  );
};

const remove = () => {
  const x = t.value;
  if (!x) return;
  if (
    !confirm(
      `Удалить турнир №${x.number} целиком — дни, составы команд, забеги? Вернуть будет нельзя.`,
    )
  )
    return;
  act(() =>
    $fetch<{ ok: boolean }>(`/api/admin/maze/tournaments/${x.id}`, {
      method: "DELETE",
    }),
  );
};

const status = computed(() => {
  const x = t.value;
  if (!x) return "Турниров ещё не было.";
  if (x.finished) {
    const w = x.score.leader;
    return `Турнир №${x.number} окончен: ${
      w ? `победили ${MAZE_TEAMS[w].name}` : "ничья"
    }, ${x.score.points.goblins} : ${x.score.points.antinium}.`;
  }
  return `Идёт турнир №${x.number}, день ${x.round} из ${x.days}. Счёт ${x.score.points.goblins} : ${x.score.points.antinium}.`;
});
</script>

<template>
  <section class="card card--panel card--wide">
    <h2>Лабиринт</h2>

    <p class="note">
      Турнир — пять дней, каждый день новый лабиринт, к концу крупнее. Очко дня
      — команде с лучшим временем дня; итоги — в полночь по Москве. В режиме
      «Только для админов» всё работает как для всех, но видят и играют только
      админы — можно пройти весь путь на проде вдвоём.
    </p>

    <div class="field-row">
      <label for="maze-mode">Ивент</label>
      <select id="maze-mode" v-model="mode">
        <option v-for="m in MAZE_MODES" :key="m.value" :value="m.value">
          {{ m.label }}
        </option>
      </select>
    </div>

    <div class="field-row">
      <label>Размер лабиринта по дням</label>
      <div class="sizes">
        <label v-for="(_, i) in sizes" :key="i" class="size">
          <span>День {{ i + 1 }}</span>
          <input
            v-model.number="sizes[i]"
            type="number"
            :min="MAZE_SIZE_MIN"
            :max="MAZE_SIZE_MAX"
          />
        </label>
      </div>
      <span class="hint"
        >От {{ MAZE_SIZE_MIN }} до {{ MAZE_SIZE_MAX }}. Начавшийся день свой
        размер не меняет — новый размер достанется следующим дням.</span
      >
    </div>

    <div class="row">
      <button
        class="btn btn--primary"
        type="button"
        :disabled="saving || !sizesOk"
        @click="save"
      >
        {{ saving ? "Сохраняем…" : "Сохранить" }}
      </button>
      <NuxtLink to="/maze" class="btn btn--ghost">Открыть лабиринт</NuxtLink>
    </div>
    <p v-if="saveMsg" class="result-msg">{{ saveMsg }}</p>

    <hr class="section-divider" />

    <h3 class="sub">Турнир</h3>
    <p class="status">{{ status }}</p>

    <template v-if="t">
      <div class="teams">
        <div
          v-for="team in MAZE_TEAM_IDS"
          :key="team"
          class="team"
          :style="{ '--team': MAZE_TEAMS[team].color }"
        >
          <b>{{ MAZE_TEAMS[team].name }} · {{ t.teams[team].length }}</b>
          <span>{{ t.teams[team].map((m) => m.name).join(", ") || "—" }}</span>
        </div>
      </div>

      <ol class="days">
        <li v-for="d in t.results" :key="d.round">
          <b>День {{ d.round }}</b> · {{ d.size }}×{{ d.size }} · {{ d.day }}
          <template v-if="!d.closed"> · идёт</template>
          —
          <template v-for="team in MAZE_TEAM_IDS" :key="team">
            {{ MAZE_TEAMS[team].name }}:
            {{
              d.best[team]
                ? `${formatMazeTime(d.best[team]!.ms)} (${d.best[team]!.name})`
                : "—"
            }};
          </template>
          {{
            d.leader
              ? `${d.closed ? "очко" : "ведут"} ${MAZE_TEAMS[d.leader].name}`
              : "без очка"
          }}
        </li>
      </ol>
    </template>

    <div class="row">
      <button
        v-if="!active"
        class="btn btn--primary"
        type="button"
        :disabled="busy"
        @click="startTournament"
      >
        Начать турнир сегодня
      </button>
      <button
        v-if="active"
        class="btn btn--ghost"
        type="button"
        :disabled="busy"
        @click="advance"
      >
        Закончить день сейчас
      </button>
      <button
        v-if="t"
        class="btn btn--outline-danger"
        type="button"
        :disabled="busy"
        @click="remove"
      >
        Удалить турнир
      </button>
    </div>
    <p v-if="error" class="form-error">{{ error }}</p>
  </section>
</template>

<style scoped src="../assets/css/admin-panel.css"></style>

<style scoped>
.note {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-muted);
}

.sizes {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.size {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
  text-transform: none;
  letter-spacing: 0;
}

.hint {
  font-size: 12px;
  color: var(--text-muted);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.sub {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--parchment-2);
}

.status {
  margin: 0 0 12px;
  font-size: 14px;
}

.teams {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 13px;
}

.team {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 10px;
  border-left: 3px solid var(--team);
}

.team b {
  color: var(--team);
}

.days {
  margin: 0 0 14px;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--parchment-2);
}
</style>
