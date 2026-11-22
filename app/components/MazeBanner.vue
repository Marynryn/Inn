<script setup lang="ts">
import type { MazeBanner, MazeTeam } from "#shared/utils/mazeTournament";
import { MAZE_TEAMS, MAZE_TEAM_IDS } from "#shared/utils/mazeTournament";
import { formatMazeTime } from "#shared/utils/maze";

/**
 * Лабиринт на главной: окошко в зимнюю ночь посреди пергамента — счёт
 * турнира, кто ведёт сегодня и дорога в лабиринт. Турнира нет — зовёт ждать.
 */
const props = defineProps<{ banner: MazeBanner }>();

const t = computed(() => props.banner.tournament);

const caption = computed(() => {
  const x = t.value;
  if (!x) return "Гоблины против Антиниумов — турнир скоро";
  if (x.finished) {
    const w = x.leader;
    return w
      ? `Турнир №${x.number} окончен — победили ${MAZE_TEAMS[w].name}`
      : `Турнир №${x.number} окончен — ничья`;
  }
  return `Турнир №${x.number} · день ${x.round} из ${x.days}`;
});

const todayLine = computed(() => {
  const d = t.value?.today;
  if (!t.value || t.value.finished) return "";
  if (!d) return "Сегодня ещё никто не дошёл до тепла";
  return `Сегодня ведут ${MAZE_TEAMS[d.team].name} — ${formatMazeTime(d.ms)}`;
});

const teamStyle = (team: MazeTeam) => ({ "--team": MAZE_TEAMS[team].color });
</script>

<template>
  <aside class="maze-banner" aria-labelledby="maze-banner-title">
    <SnowCap />
    <div class="body">
      <p id="maze-banner-title" class="title display">Лабиринт</p>
      <p class="caption">{{ caption }}</p>
      <div v-if="t" class="score" aria-label="Счёт">
        <template v-for="(team, i) in MAZE_TEAM_IDS" :key="team">
          <span v-if="i" class="colon" aria-hidden="true">:</span>
          <span class="side" :style="teamStyle(team)">
            <span class="name">{{ MAZE_TEAMS[team].name }}</span>
            <span class="points display">{{ t.points[team] }}</span>
          </span>
        </template>
      </div>
      <p v-if="todayLine" class="today">{{ todayLine }}</p>
    </div>
    <NuxtLink to="/maze" class="btn btn--lg btn--primary go">
      {{ t && !t.finished ? "В лабиринт" : "Подробнее" }}
    </NuxtLink>
  </aside>
</template>

<style scoped>
/* Тёмная ночь на пергаменте: как в самом лабиринте. Снег лежит поверх
   кромки и выступает за неё. */
.maze-banner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 20px 22px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(43, 30, 22, 0.2);
  background:
    radial-gradient(
      circle at 92% 50%,
      rgba(255, 186, 110, 0.18),
      transparent 40%
    ),
    linear-gradient(180deg, #13203a 0%, #0b111d 100%);
  color: #e8f1fb;
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title {
  margin: 0;
  font-size: 22px;
}

.caption {
  margin: 0;
  font-size: 13px;
  color: #9fc3e3;
}

.score {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 4px;
}

.side {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}

.side:last-child {
  flex-direction: row-reverse;
}

.name {
  font-size: 14px;
  font-weight: 600;
  color: var(--team);
}

.points {
  font-size: 26px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.colon {
  font-size: 20px;
  color: rgba(232, 241, 251, 0.5);
}

.today {
  margin: 2px 0 0;
  font-size: 13px;
  color: #ffcf7a;
}

.go {
  flex: none;
}

@media (max-width: 600px) {
  .maze-banner {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
    padding: 18px 16px 16px;
  }

  .go {
    text-align: center;
  }
}
</style>
