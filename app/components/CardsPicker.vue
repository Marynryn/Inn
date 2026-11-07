<script setup lang="ts">
/**
 * Выбор отряда «Карт таверны»: трое из двенадцати героев, с их навыками и
 * правилами под списком. Один и тот же на игре с компьютером и за столом.
 */
import {
  CARD_HEROES,
  CARD_HERO_IDS,
  CARD_ELEMENTS,
  type HeroId,
  type Element,
} from "#shared/utils/cards";

const props = defineProps<{ modelValue: HeroId[] }>();
const emit = defineEmits<{ "update:modelValue": [team: HeroId[]] }>();

function togglePick(id: HeroId) {
  const team = [...props.modelValue];
  const i = team.indexOf(id);
  if (i >= 0) team.splice(i, 1);
  else if (team.length < 3) team.push(id);
  emit("update:modelValue", team);
}

const elColor = (el: Element) => CARD_ELEMENTS[el].color;

/** Место в очереди: первый выбранный выходит в бой, остальные ждут в запасе
 *  в том же порядке. 0 — герой не выбран. */
const place = (id: HeroId) => props.modelValue.indexOf(id) + 1;
const placeText = (n: number) =>
  n === 1 ? "выходит в бой первым" : `в запасе, ${n}-й в очереди`;
</script>

<template>
  <div>
    <h2 class="section-title display">
      Выбери троих · {{ modelValue.length }}/3
    </h2>
    <p class="order-hint">
      Первый выбранный выходит в бой, остальные ждут в запасе по порядку.
    </p>
    <ul class="roster">
      <li v-for="id in CARD_HERO_IDS" :key="id">
        <button
          class="pick"
          :class="{ 'pick--on': modelValue.includes(id) }"
          :style="{ '--el': elColor(CARD_HEROES[id].el) }"
          :aria-pressed="modelValue.includes(id)"
          @click="togglePick(id)"
        >
          <span class="pick-portrait">
            <CardsHeroImg :id="id" class="pick-img" lazy />
            <span v-if="place(id)" class="pick-place" aria-hidden="true">{{
              place(id)
            }}</span>
          </span>
          <span class="pick-body">
            <span class="pick-head">
              <span class="pick-name">{{ CARD_HEROES[id].name }}</span>
              <span class="pick-el"
                ><span class="el-icon" aria-hidden="true">{{
                  CARD_ELEMENTS[CARD_HEROES[id].el].symbol
                }}</span
                >{{ CARD_ELEMENTS[CARD_HEROES[id].el].name }}</span
              >
            </span>
            <span v-if="place(id)" class="pick-order">{{
              placeText(place(id))
            }}</span>
            <span class="pick-meta"
              >{{ CARD_HEROES[id].role }} · <span class="hp-heart">❤︎</span>
              {{ CARD_HEROES[id].hp }}</span
            >
            <span v-if="CARD_HEROES[id].passive" class="pick-move"
              ><i>Пассивка</i> <b>{{ CARD_HEROES[id].passive!.name }}:</b>
              {{ CARD_HEROES[id].passive!.text }}</span
            >
            <span class="pick-move"
              ><i>Навык</i> <b>{{ CARD_HEROES[id].skill.name }}:</b>
              {{ CARD_HEROES[id].skill.text }}</span
            >
            <span class="pick-move"
              ><i>Ульта</i> <b>{{ CARD_HEROES[id].burst.name }}:</b>
              {{ CARD_HEROES[id].burst.text }}</span
            >
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

.order-hint {
  margin: -6px 0 12px;
  font-size: 13px;
  color: var(--text-muted);
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
  border: 1px solid var(--line-strong, rgba(241, 230, 210, 0.2));
  background: var(--fill);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.pick:hover {
  background: var(--fill-strong);
}

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
  /* Без зазора под картинкой: значок-заглушку (flex) не трогаем. */
  vertical-align: top;
}

/* Номер в очереди — кружком на портрете, как цена на карте в руке. */
.pick-portrait {
  position: relative;
  flex-shrink: 0;
  align-self: flex-start;
}
.pick-place {
  position: absolute;
  top: -6px;
  left: -6px;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-round);
  background: var(--el);
  color: var(--ink);
  font-weight: 700;
  font-size: 14px;
  display: grid;
  place-items: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
}
.pick-order {
  font-size: 12px;
  font-weight: 600;
  color: var(--el);
}

.pick-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.pick-name {
  font-family: var(--font-display);
  font-size: 20px;
}
.pick-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.pick-el {
  font-size: 13px;
  color: var(--el);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.pick-meta {
  font-size: 13px;
  color: var(--text-muted);
}
/* Сердечко здоровья — розовое; знак текстовый, иначе эмодзи красное. */
.hp-heart {
  color: #f08cb4;
}
.pick-move {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}
.pick-move i {
  font-style: normal;
  color: var(--ember-soft);
}
.pick-move b {
  color: var(--parchment-2);
  font-weight: 600;
}

/* Значок стихии — тот же, что на кубиках: игрок сразу видит, какие грани
   ему нужны. Кружок одного цвета различался плохо. */
.el-icon {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-round);
  border: 1px solid var(--el);
  background: color-mix(in srgb, var(--el) 18%, transparent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
}
</style>
