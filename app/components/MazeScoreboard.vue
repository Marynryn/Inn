<script setup lang="ts">
import type {
  MazeTeam,
  MazeTournamentView,
} from "#shared/utils/mazeTournament";
import { MAZE_TEAMS, MAZE_TEAM_IDS } from "#shared/utils/mazeTournament";
import { formatMazeTime } from "#shared/utils/maze";

/**
 * Табло турнира: счёт команд, кто ведёт сегодня, итоги по дням и составы.
 * Очко дня — у команды с лучшим временем; сегодняшний день ещё может
 * перемениться, поэтому он «ведут», а не «очко».
 */
const props = defineProps<{
  tournament: MazeTournamentView;
  myTeam: MazeTeam | null;
}>();

const t = computed(() => props.tournament);
const today = computed(() => t.value.results.find((d) => !d.closed) ?? null);

const headline = computed(() => {
  if (t.value.finished) return `Турнир №${t.value.number} окончен`;
  return `Турнир №${t.value.number} · день ${t.value.round} из ${t.value.days}`;
});

const verdict = computed(() => {
  if (!t.value.finished) return "";
  const w = t.value.score.leader;
  if (!w) return "Ничья!";
  return t.value.score.byTime
    ? `Победили ${MAZE_TEAMS[w].name} — очков поровну, но по сумме времени они быстрее`
    : `Победили ${MAZE_TEAMS[w].name}!`;
});

const todayLine = computed(() => {
  const d = today.value;
  if (!d) return "";
  if (!d.leader) return "Сегодня ещё никто не дошёл до тепла — время есть.";
  const best = d.best[d.leader]!;
  return `Сегодня ведут ${MAZE_TEAMS[d.leader].name} — ${formatMazeTime(best.ms)}`;
});
const todayBy = computed(() => {
  const d = today.value;
  return d?.leader ? d.best[d.leader]! : null;
});

/** Строки по всем дням турнира: прошедшие, сегодняшний и будущие. */
const rows = computed(() =>
  Array.from({ length: t.value.days }, (_, i) => {
    const d = t.value.results[i];
    return {
      round: i + 1,
      size: t.value.sizes[i]!,
      result: d ?? null,
      state: !d ? "ahead" : d.closed ? "done" : "today",
    } as const;
  }),
);

const NuxtLink = resolveComponent("NuxtLink");
// Имя ведёт на страницу читателя; у кого кода нет — просто подпись.
type Named = { code: string | null };
const nameTag = (b: Named) => (b.code ? NuxtLink : "span");
const readerHref = (b: Named) => (b.code ? `/reader/${b.code}` : undefined);
const teamStyle = (team: MazeTeam) => ({ "--team": MAZE_TEAMS[team].color });
</script>

<template>
  <section class="card card--panel board">
    <SnowCap />
    <div class="eyebrow">{{ headline }}</div>

    <div class="score" aria-label="Счёт">
      <div
        v-for="(team, i) in MAZE_TEAM_IDS"
        :key="team"
        class="side"
        :class="[`side--${i ? 'right' : 'left'}`, { mine: team === myTeam }]"
        :style="teamStyle(team)"
      >
        <span class="team-name">{{ MAZE_TEAMS[team].name }}</span>
        <span class="points display">{{ t.score.points[team] }}</span>
        <!-- Подпись есть у обеих сторон (у чужой — невидимая), чтобы счёт
             стоял на одной высоте. -->
        <span class="you" :class="{ hidden: team !== myTeam }"
          >твоя команда</span
        >
      </div>
      <span class="colon display" aria-hidden="true">:</span>
    </div>

    <p v-if="verdict" class="verdict display">{{ verdict }}</p>
    <p v-else-if="todayLine" class="today">
      {{ todayLine }}
      <template v-if="todayBy">
        ·
        <component
          :is="nameTag(todayBy)"
          :to="readerHref(todayBy)"
          class="who"
          >{{ todayBy.name }}</component
        >
      </template>
    </p>

    <ol class="days">
      <li
        v-for="row in rows"
        :key="row.round"
        class="day"
        :class="`day--${row.state}`"
      >
        <div class="day-head">
          <span class="day-num">День {{ row.round }}</span>
          <span class="day-size">{{ row.size }}×{{ row.size }}</span>
          <span v-if="row.state === 'today'" class="day-tag">сегодня</span>
          <span v-else-if="row.state === 'ahead'" class="day-tag">впереди</span>
        </div>
        <div v-if="row.result" class="day-teams">
          <div
            v-for="team in MAZE_TEAM_IDS"
            :key="team"
            class="cell"
            :class="{ won: row.result.leader === team }"
            :style="teamStyle(team)"
          >
            <template v-if="row.result.best[team]">
              <span class="time">{{
                formatMazeTime(row.result.best[team]!.ms)
              }}</span>
              <component
                :is="nameTag(row.result.best[team]!)"
                :to="readerHref(row.result.best[team]!)"
                class="who"
                >{{ row.result.best[team]!.name }}</component
              >
            </template>
            <span v-else class="none">—</span>
            <span
              v-if="row.result.leader === team"
              class="mark"
              :title="row.state === 'done' ? 'Очко дня' : 'Ведут'"
              >{{ row.state === "done" ? "очко" : "ведут" }}</span
            >
          </div>
        </div>
      </li>
    </ol>

    <div class="rosters">
      <div
        v-for="team in MAZE_TEAM_IDS"
        :key="team"
        class="roster"
        :style="teamStyle(team)"
      >
        <span class="roster-title"
          >{{ MAZE_TEAMS[team].name }} · {{ t.teams[team].length }}</span
        >
        <span v-if="!t.teams[team].length" class="none">пока никого</span>
        <span v-else class="roster-names">
          <template v-for="(m, i) in t.teams[team]" :key="i">
            <component :is="nameTag(m)" :to="readerHref(m)" class="who">{{
              m.name
            }}</component
            ><template v-if="i < t.teams[team].length - 1">, </template>
          </template>
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.board {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #9fc3e3;
}

/* Счёт: команды по краям, двоеточие посередине. */
.score {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  align-items: end;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.side--left {
  align-items: flex-end;
  text-align: right;
}

.side--right {
  align-items: flex-start;
}

.team-name {
  font-size: 15px;
  color: var(--team);
  font-weight: 600;
}

.points {
  font-size: 52px;
  line-height: 1;
  color: var(--parchment);
  font-variant-numeric: tabular-nums;
}

.you {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--team);
  opacity: 0.85;
}

.you.hidden {
  visibility: hidden;
}

.colon {
  position: absolute;
  left: 50%;
  top: 22px;
  transform: translateX(-50%);
  font-size: 40px;
  color: var(--text-muted);
}

.verdict {
  margin: 0;
  text-align: center;
  font-size: 20px;
  color: #ffcf7a;
}

.today {
  margin: 0;
  text-align: center;
  font-size: 14px;
  color: #ffcf7a;
}

.who {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px dotted currentColor;
}

a.who:hover {
  color: var(--parchment);
}

/* Дни турнира. */
.days {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.day {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--fill);
  border: 1px solid var(--line-faint);
}

.day--today {
  border-color: rgba(255, 207, 122, 0.4);
  background: rgba(255, 186, 110, 0.06);
}

.day--ahead {
  opacity: 0.5;
}

.day-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
}

.day-num {
  font-weight: 600;
}

.day-size {
  color: var(--text-muted);
}

.day-tag {
  margin-left: auto;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #ffcf7a;
}

.day--ahead .day-tag {
  color: var(--text-muted);
}

.day-teams {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

.cell {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--team);
  background: var(--fill-faint);
  font-size: 13px;
  min-width: 0;
}

.cell.won {
  background: color-mix(in srgb, var(--team) 14%, transparent);
}

.time {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.cell .who {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.mark {
  margin-left: auto;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--team);
}

.none {
  color: var(--text-muted);
}

/* Составы. */
.rosters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  font-size: 13px;
}

.roster {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.roster-title {
  color: var(--team);
  font-weight: 600;
}

.roster-names {
  color: var(--text-muted);
  line-height: 1.5;
}

@media (max-width: 480px) {
  .points {
    font-size: 42px;
  }

  .day-teams,
  .rosters {
    gap: 6px;
  }

  .cell {
    font-size: 12px;
  }
}
</style>
