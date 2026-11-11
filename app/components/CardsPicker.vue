<script setup lang="ts">
/**
 * Выбор отряда «Странствующей колоды»: трое из двенадцати героев, с их навыками и
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

/** Строки описания героя: пассивка (если есть), навык, ульта. */
const moves = (id: HeroId) => {
  const h = CARD_HEROES[id];
  return [
    ...(h.passive ? [{ label: "Пассивка", ...h.passive }] : []),
    { label: "Навык", ...h.skill },
    { label: "Ульта", ...h.burst },
  ];
};

// Описание всплывает при наведении. На телефоне наведения нет — там оно
// открывается под картой, на которую нажали, и закрывается нажатием мимо.
const shown = ref<HeroId | null>(null);
function onPick(id: HeroId) {
  shown.value = id;
  togglePick(id);
}
const roster = ref<HTMLElement | null>(null);
function closeOutside(e: PointerEvent) {
  if (!roster.value?.contains(e.target as Node)) shown.value = null;
}
onMounted(() => document.addEventListener("pointerdown", closeOutside));
onBeforeUnmount(() =>
  document.removeEventListener("pointerdown", closeOutside),
);
</script>

<template>
  <div>
    <h2 class="section-title display">
      Выбери троих · {{ modelValue.length }}/3
    </h2>
    <p class="order-hint">
      Первый выбранный выходит в бой, остальные ждут в запасе по порядку.
    </p>
    <ul ref="roster" class="roster">
      <li v-for="id in CARD_HERO_IDS" :key="id">
        <button
          class="pick"
          :class="{
            'pick--on': modelValue.includes(id),
            'pick--shown': shown === id,
          }"
          :style="{ '--el': elColor(CARD_HEROES[id].el) }"
          :aria-pressed="modelValue.includes(id)"
          @click="onPick(id)"
        >
          <span
            class="pick-portrait"
            :style="heroCardStyle(id, elColor(CARD_HEROES[id].el))"
          >
            <CardsHeroImg :id="id" class="pick-img" lazy />
            <span class="hp-heart" :title="`Здоровье: ${CARD_HEROES[id].hp}`">{{
              CARD_HEROES[id].hp
            }}</span>
            <span class="pick-plate">
              <span class="pick-name">{{ CARD_HEROES[id].name }}</span>
              <span
                class="pick-energy"
                :title="`Ульта: нужно ${CARD_HEROES[id].energy} энергии`"
                ><i v-for="n in CARD_HEROES[id].energy" :key="n"
              /></span>
            </span>
            <span v-if="place(id)" class="pick-place" aria-hidden="true">{{
              place(id)
            }}</span>
          </span>
          <span class="pick-body pick-body--pop">
            <span v-if="place(id)" class="pick-order">{{
              placeText(place(id))
            }}</span>
            <span v-for="m in moves(id)" :key="m.label" class="pick-move"
              ><i>{{ m.label }}</i> <b>{{ m.name }}:</b> {{ m.text }}</span
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
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 14px 10px;
}
.roster > li {
  position: relative; /* для всплывающего описания */
  display: flex;
  justify-content: center;
}
.roster > li:hover,
.roster > li:focus-within {
  z-index: 5; /* описание — поверх соседних карт */
}

/* Кнопка — сама карта героя, без своей подложки. Выбранная — приподнята и
   светится цветом стихии по контуру рамки. */
.pick {
  width: 100%;
  max-width: 210px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    filter 0.15s ease;
}
.pick:hover {
  transform: translateY(-3px);
}
.pick--on {
  transform: translateY(-4px);
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--el) 85%, transparent));
}

/* Карта героя в рамке его стихии — та же, что на столе (холст 393×535,
   см. app/utils/cardFrames.ts): портрет в окне рамки, на плашке имя и
   здоровье. */
.pick-portrait {
  position: relative;
  display: block;
  container-type: inline-size;
  width: 100%;
  aspect-ratio: 393 / 535;
  isolation: isolate;
}
.pick-portrait::before {
  content: "";
  position: absolute;
  inset: 14cqw 16cqw 29cqw;
  z-index: -1;
  background: #241a14;
}
.pick-portrait::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  background: var(--frame) center / 100% 100% no-repeat;
  pointer-events: none;
}
.pick-portrait > .pick-img {
  position: absolute;
  left: 20.36cqw;
  top: 16.03cqw;
  width: 60.05cqw;
  height: 76.34cqw;
}
/* Как на столе: на плашке имя и под ним бусины ульты, здоровье — сердечком
   в левом углу портрета, номер в очереди — в правом. */
.pick-plate {
  z-index: 3;
  position: absolute;
  top: var(--plate, 108cqw);
  left: 20cqw;
  right: 20cqw;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5cqw;
  color: #2b1f14;
}
.pick-energy {
  display: flex;
  gap: 1.5cqw;
}
.pick-energy i {
  width: 3.6cqw;
  height: 3.6cqw;
  border-radius: var(--radius-round);
  border: 1px solid #6f4f1a;
}

/* Номер в очереди — кружком на портрете, как цена на карте в руке. */
.pick-place {
  z-index: 3; /* над рамкой */
  position: absolute;
  top: 18cqw;
  right: 22cqw;
  width: 13cqw;
  height: 13cqw;
  border-radius: var(--radius-round);
  background: var(--el);
  color: var(--ink);
  font-weight: 700;
  font-size: 7cqw;
  display: grid;
  place-items: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
}
.pick-order {
  font-size: 12px;
  font-weight: 600;
  color: var(--el);
}

/* Описание героя — окошком под картой: на компьютере при наведении, на
   телефоне — у карты, на которую нажали (см. shown). */
.pick-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  text-align: left;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--el) 55%, transparent);
  background: rgba(24, 17, 13, 0.97);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
}
.pick-body--pop {
  position: absolute;
  top: calc(100% - 6px);
  left: 50%;
  width: 250px;
  transform: translateX(-50%);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.12s ease;
}
@media (hover: hover) {
  .pick:hover .pick-body--pop,
  .pick:focus-visible .pick-body--pop {
    opacity: 1;
    visibility: visible;
  }
}
@media (hover: none) {
  .pick--shown .pick-body--pop {
    opacity: 1;
    visibility: visible;
  }
}
/* На телефоне — две карты в ряд; окошко во всю ширину сетки, от края
   своей колонки, чтобы не уезжало за экран. */
@media (max-width: 520px) {
  .roster {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .pick-body--pop {
    width: calc(200% + 10px);
    transform: none;
  }
  .roster > li:nth-child(odd) .pick-body--pop {
    left: 0;
  }
  .roster > li:nth-child(even) .pick-body--pop {
    left: auto;
    right: 0;
  }
}
.pick-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-display);
  font-size: 9.5cqw;
  font-weight: 700;
  line-height: 1;
}
/* Здоровье — цифрой в сердечке, в углу портрета — как на столе. */
.hp-heart {
  z-index: 3;
  position: absolute;
  top: 18cqw;
  left: 22cqw;
  display: grid;
  place-items: center;
  width: 19cqw;
  height: 17cqw;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 22'%3E%3Cpath d='M12 20.5S2.2 14.6 1.2 8.3C.5 4.2 3.3 1.3 6.6 1.3c2.4 0 4.2 1.4 5.4 3.2 1.2-1.8 3-3.2 5.4-3.2 3.3 0 6.1 2.9 5.4 7C21.8 14.6 12 20.5 12 20.5z' fill='%23c8344a'/%3E%3C/svg%3E")
    center / 100% 100% no-repeat;
  color: #fff;
  font-size: 6.2cqw;
  letter-spacing: -0.03em;
  font-weight: 700;
  line-height: 1;
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
</style>
