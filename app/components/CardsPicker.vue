<script setup lang="ts">
/**
 * Выбор отряда «Карт таверны»: трое из шести героев, с их навыками и
 * правилами под списком. Один и тот же на игре с компьютером и за столом.
 */
import { CARD_HEROES, CARD_HERO_IDS, CARD_ELEMENTS, type HeroId, type Element } from '#shared/utils/cards'

const props = defineProps<{ modelValue: HeroId[] }>()
const emit = defineEmits<{ 'update:modelValue': [team: HeroId[]] }>()

function togglePick(id: HeroId) {
  const team = [...props.modelValue]
  const i = team.indexOf(id)
  if (i >= 0) team.splice(i, 1)
  else if (team.length < 3) team.push(id)
  emit('update:modelValue', team)
}

const elColor = (el: Element) => CARD_ELEMENTS[el].color
const imgOf = (id: HeroId) => `/characters/${id}.webp`
</script>

<template>
  <div>
    <h2 class="section-title display">Выбери троих · {{ modelValue.length }}/3</h2>
  <ul class="roster">
    <li v-for="id in CARD_HERO_IDS" :key="id">
      <button
        class="pick"
        :class="{ 'pick--on': modelValue.includes(id) }"
        :style="{ '--el': elColor(CARD_HEROES[id].el) }"
        :aria-pressed="modelValue.includes(id)"
        @click="togglePick(id)"
      >
        <img :src="imgOf(id)" :alt="CARD_HEROES[id].name" class="pick-img" loading="lazy">
        <span class="pick-body">
          <span class="pick-head">
            <span class="pick-name">{{ CARD_HEROES[id].name }}</span>
            <span class="pick-el"><span class="el-dot" />{{ CARD_ELEMENTS[CARD_HEROES[id].el].name }}</span>
          </span>
          <span class="pick-meta">{{ CARD_HEROES[id].role }} · ❤ {{ CARD_HEROES[id].hp }}</span>
          <span class="pick-move"><b>{{ CARD_HEROES[id].skill.name }}:</b> {{ CARD_HEROES[id].skill.text }}</span>
          <span class="pick-move"><b>{{ CARD_HEROES[id].burst.name }}:</b> {{ CARD_HEROES[id].burst.text }}</span>
        </span>
      </button>
    </li>
  </ul>
    <slot />
  <CardsRules />
  </div>
</template>

<style scoped>
.section-title {
  margin: 28px 0 12px;
  font-size: 22px;
}

/* ─── Выбор отряда ─── */
.roster {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

.pick {
  width: 100%;
  height: 100%;
  display: flex;
  gap: 12px;
  text-align: left;
  padding: 10px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line-strong, rgba(241, 230, 210, .2));
  background: var(--fill);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.pick:hover { background: var(--fill-strong); }

.pick--on {
  border-color: var(--el);
  box-shadow: 0 0 0 2px var(--el) inset;
  background: var(--fill-bold);
}

.pick-img {
  width: 72px;
  height: 96px;
  object-fit: cover;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.pick-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pick-name { font-family: var(--font-display); font-size: 20px; }
.pick-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.pick-el { font-size: 13px; color: var(--el); display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.pick-meta { font-size: 13px; color: var(--text-muted); }
.pick-move { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
.pick-move b { color: var(--parchment-2); font-weight: 600; }

.el-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-round);
  background: var(--el);
  display: inline-block;
}


</style>
