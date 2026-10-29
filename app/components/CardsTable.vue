<script setup lang="ts">
/**
 * Стол «Карт таверны»: поле, кубики, ходы, рука. Партию показывает глазами
 * игрока — он снизу, сторона 0 — и только просит сходить (событие act).
 * Кто ходит в ответ — компьютер на странице или сервер, — стол не знает.
 */
import {
  CARD_HEROES, CARDS, CARD_ELEMENTS, ATTACK_COST, SKILL_COST, BURST_COST, SWITCH_COST,
  cardsCheck, cardsActive, dieColor, dieName, dieSymbol,
  type Game, type Fx, type HeroId, type CardId, type Action, type Cost, type Element, type Fighter,
} from '#shared/utils/cards'

const props = defineProps<{ game: Game }>()
const emit = defineEmits<{ act: [action: Action]; leave: [] }>()
const game = toRef(props, 'game')

const selected = ref<{ kind: 'fighter' | 'card'; idx: number } | null>(null)
const rerollPick = ref<number[]>([])

function act(a: Action) {
  emit('act', a)
  selected.value = null
  rerollPick.value = []
  doorCard.value = null
}

/** Карта с выбором героя (дверь) сыграна, ждём клика по герою — как когда
 *  герой пал: рамкой на тех, кто может выйти. Номер карты в руке. */
const doorCard = ref<number | null>(null)

function playCard(idx: number) {
  const card = CARDS[game.value.players[0].hand[idx]!]
  if (!card.target) return act({ type: 'play', card: idx })
  doorCard.value = idx
  selected.value = null
}

/** Можно ли сыграть карту: у карты с выбором — хоть на кого-то из своих. */
function canPlay(idx: number) {
  if (!CARDS[me.value.hand[idx]!].target) return can({ type: 'play', card: idx }).ok
  return me.value.fighters.some((_, to) => can({ type: 'play', card: idx, to }).ok)
}

const me = computed(() => game.value.players[0])
const foe = computed(() => game.value.players[1])
const myActive = computed(() => cardsActive(me.value))
const myEl = computed(() => CARD_HEROES[myActive.value.id].el)
const myTurn = computed(() => {
  const g = game.value
  return g.phase === 'action' && g.choosing === null && g.turn === 0 && !g.players[0].ended
})

const can = (a: Action) => cardsCheck(game.value, 0, a)

// Всплывающие цифры: что случилось за последний ход. Поколение меняет ключи,
// чтобы анимация шла заново, даже если цифры те же.
const fx = shallowRef<Fx[]>([])
const fxGen = ref(0)
let fxTimer: ReturnType<typeof setTimeout> | null = null
watch(game, (g) => {
  if (!g.fx.length) return
  fx.value = g.fx
  fxGen.value++
  if (fxTimer) clearTimeout(fxTimer)
  fxTimer = setTimeout(() => { fx.value = [] }, 2400)
})
const popsFor = (side: 0 | 1, idx: number) => fx.value.filter(x => x.side === side && x.idx === idx)

// Победитель — крупно поверх поля, как в настольной игре. Только в момент,
// когда партия кончилась: вернулся к доигранной — баннер не выскакивает.
const winShown = ref(false)
let winTimer: ReturnType<typeof setTimeout> | null = null
watch(() => game.value.phase, (phase, was) => {
  if (phase !== 'over' || was === 'over' || game.value.winner === null) return
  winShown.value = true
  if (winTimer) clearTimeout(winTimer)
  winTimer = setTimeout(() => { winShown.value = false }, 8000)
})
const win = computed(() => {
  const g = game.value
  const mine = g.winner === 0
  const name = g.vs === 'online' ? g.names[g.winner ?? 0] : (mine ? 'Ты' : 'Компьютер')
  const left = /уходит из-за стола/.test(g.log.at(-1) ?? '')
  return {
    title: mine ? 'Победа!' : g.vs === 'online' ? 'Победа!' : 'Поражение',
    name: g.vs === 'online' && mine ? `${name} — это ты` : name,
    hint: left ? 'соперник ушёл из-за стола' : 'выводит из боя всех героев соперника',
    // Проигрыш компьютеру — красным; по сети, как в настольной игре, всем
    // одинаково золотом: «Победа!» и имя победителя.
    lose: g.vs === 'computer' && !mine,
  }
})

onBeforeUnmount(() => {
  if (fxTimer) clearTimeout(fxTimer)
  if (winTimer) clearTimeout(winTimer)
})

// ─── Действия по выбранному ───────────────────────────────
function clickMine(idx: number) {
  const g = game.value
  if (g.choosing === 0) return act({ type: 'choose', to: idx })
  if (doorCard.value !== null) {
    if (idx !== g.players[0].active) act({ type: 'play', card: doorCard.value, to: idx })
    return
  }
  if (idx === g.players[0].active) return
  selected.value = selected.value?.kind === 'fighter' && selected.value.idx === idx ? null : { kind: 'fighter', idx }
}

function clickCard(idx: number) {
  doorCard.value = null
  selected.value = selected.value?.kind === 'card' && selected.value.idx === idx ? null : { kind: 'card', idx }
}

/** Одинаковые карты в руке — одной карточкой со счётчиком. Ход по ней берёт
 *  первую такую карту: копии ничем не отличаются. */
const handGroups = computed(() => {
  const groups: { card: CardId; idx: number; count: number }[] = []
  me.value?.hand.forEach((card, idx) => {
    const g = groups.find(x => x.card === card)
    if (g) g.count++
    else groups.push({ card, idx, count: 1 })
  })
  return groups
})

/** Кубик под перекраску: первый, что не подходит активному герою. */
const strayDie = computed(() => me.value?.dice.findIndex(d => d !== myEl.value && d !== 'omni') ?? -1)

/** Подпись у «Перекрасить кубик»: что станет — или почему нельзя. Без
 *  объяснения казалось, что кнопка не работает. */
const tuneHint = computed(() => {
  if (!myTurn.value) return ''
  const name = CARD_HEROES[myActive.value.id].name
  if (!me.value.dice.length) return 'Кубиков не осталось — перекрашивать нечего'
  if (strayDie.value < 0) return `Все кубики уже подходят: ${name}`
  return `карта сгорит, кубик ${dieSymbol(me.value.dice[strayDie.value]!)} станет ${dieSymbol(myEl.value)}`
})

function toggleReroll(i: number) {
  const k = rerollPick.value.indexOf(i)
  if (k >= 0) rerollPick.value.splice(k, 1)
  else rerollPick.value.push(i)
}

const roundsLeft = (n: number) => (n === 1 ? 'последний раунд' : `ещё ${n} ${n < 5 ? 'раунда' : 'раундов'}`)

// ─── Подписи ──────────────────────────────────────────────
const elColor = (el: Element) => CARD_ELEMENTS[el].color
const imgOf = (id: HeroId) => `/characters/${id}.webp`

function costDots(cost: Cost, el: Element) {
  return [
    ...Array.from({ length: cost.el ?? 0 }, () => elColor(el)),
    ...Array.from({ length: cost.any ?? 0 }, () => 'var(--parchment-2)'),
  ]
}

const moves = computed(() => {
  const f = myActive.value
  if (!f) return []
  const h = CARD_HEROES[f.id]
  return [
    { type: 'attack' as const, label: 'Атака', move: h.attack, cost: ATTACK_COST },
    { type: 'skill' as const, label: 'Навык', move: h.skill, cost: SKILL_COST },
    { type: 'burst' as const, label: `Ульта · ${f.energy}/${h.energy}`, move: h.burst, cost: BURST_COST },
  ]
})

/** Подсказка к значкам на портрете: сами значки без слов. */
const statusTitle = (f: Fighter) => [
  f.shield ? `Щит: поглотит ${f.shield} урона` : '',
  f.bonus ? `Следующий удар на ${f.bonus} сильнее` : '',
  f.poison ? `Отравлен: 1 урон Ядом в конце раунда, ещё ${f.poison}` : '',
  f.frozen ? 'Заморожен до конца раунда: не может бить' : '',
].filter(Boolean).join('\n') || undefined

// Журнал почти не читают: цифры над героями уже показывают урон. На виду —
// только последнее действие (что сыграл соперник, из цифр не понять), весь
// журнал — по кнопке.
const logOpen = ref(false)
const fullLog = computed(() => [...game.value.log].reverse())
const lastAction = computed(() => {
  const log = game.value.log
  return [...log].reverse().find(l => /^(Ты|Соперник)[:]|: /.test(l) && !/получает/.test(l)) ?? log.at(-1) ?? ''
})

const banner = computed(() => {
  const g = game.value
  const foeName = g.vs === 'online' ? g.names[1] : 'соперник'
  if (g.phase === 'over') {
    if (g.winner === 0) return 'Победа! Таверна празднует.'
    return g.vs === 'online' ? `${g.names[1]} побеждает.` : 'Поражение. Ещё партию?'
  }
  if (g.choosing === 0) return 'Твой герой пал — выбери, кто выйдет в бой'
  if (doorCard.value !== null) return 'Волшебная дверь: выбери, кто выйдет в бой'
  if (g.choosing === 1) return `${foeName[0]!.toUpperCase() + foeName.slice(1)} выбирает героя…`
  if (g.phase === 'reroll') return g.players[0].rolling ? 'Отметь кубики, которые хочешь перебросить' : `Ждём: ${foeName} перебрасывает кубики`
  if (g.players[0].ended) return `Ты закончил раунд — ${foeName} доигрывает`
  return g.turn === 0 ? 'Твой ход' : `Ходит ${foeName}…`
})
</script>

<template>
  <div class="table">
    <div class="status">
      <span class="round">Раунд {{ game.round }}</span>
      <span class="banner" :class="{ 'banner--win': game.winner === 0, 'banner--lose': game.winner === 1 }">{{ banner }}</span>
      <button class="btn btn--ghost btn--sm" @click="emit('leave')">Выйти</button>
    </div>

    <!-- Поле и кубики справа, как в оригинале -->
    <div class="field">
      <button v-if="winShown" type="button" class="win" :class="{ 'win--lose': win.lose }" aria-live="assertive" @click="winShown = false">
        <span class="win-title">{{ win.title }}</span>
        <span class="win-name">{{ win.name }}</span>
        <span class="win-hint">{{ win.hint }}</span>
      </button>
      <div class="arena">
        <!-- Соперник -->
        <section class="side side--foe" aria-label="Отряд соперника">
          <div class="side-info">
            <span><b v-if="game.vs === 'online'">{{ game.names[1] }} · </b>Карт: {{ game.foeHand ?? foe.hand.length }} · Кубиков: {{ foe.dice.length }}</span>
            <span v-if="foe.skeleton" class="summon">💀 Скелет Пишеса: бьёт на 1 в конце раунда, {{ roundsLeft(foe.skeleton) }}</span>
            <span v-if="foe.ended" class="ended">закончил раунд</span>
          </div>
          <div class="row">
            <div
              v-for="(f, i) in foe.fighters"
              :key="i"
              class="fighter"
              :class="{ 'fighter--active': i === foe.active, 'fighter--down': f.hp <= 0 }"
              :style="{ '--el': elColor(CARD_HEROES[f.id].el) }"
            >
              <img :src="imgOf(f.id)" :alt="CARD_HEROES[f.id].name" class="fighter-img">
              <span class="hp">{{ f.hp }}</span>
              <span v-if="f.aura" class="aura" :style="{ '--el': elColor(f.aura) }" :title="`Метка: ${CARD_ELEMENTS[f.aura].name}`">{{ CARD_ELEMENTS[f.aura].symbol }}</span>
              <span class="energy"><i v-for="n in CARD_HEROES[f.id].energy" :key="n" :class="{ on: n <= f.energy }" /></span>
              <span class="fighter-name">{{ CARD_HEROES[f.id].name }}</span>
              <span class="pops" aria-hidden="true"><span v-for="(x, k) in popsFor(1, i)" :key="`${fxGen}-${k}`" class="pop" :class="`pop--${x.kind}`" :style="{ animationDelay: `${k * 0.15}s` }">{{ x.text }}</span></span>
<span class="effects" :title="statusTitle(f)">
                <span v-if="f.frozen" class="frost"><span class="frost-flake">❄</span></span>
                <span v-if="f.poison" class="venom" />
                <span v-if="f.shield" class="barrier" />
                <span v-if="f.shield || f.bonus" class="buffs">
                  <span v-if="f.shield" class="buff buff--shield">🛡 щит {{ f.shield }}</span>
                  <span v-if="f.bonus" class="buff buff--atk">⚔ +{{ f.bonus }}</span>
                </span>
                <span v-if="f.poison" class="buff buff--poison">🧪 {{ f.poison }}</span>
              </span>
            </div>
          </div>
        </section>

        <div class="log">
          <p class="log-last" aria-live="polite">{{ lastAction }}</p>
          <button class="log-toggle" :aria-expanded="logOpen" @click="logOpen = !logOpen">
            {{ logOpen ? 'Скрыть' : 'Журнал' }}
          </button>
          <ol v-if="logOpen" class="log-list thin-scroll">
            <li v-for="(line, i) in fullLog" :key="game.log.length - i">{{ line }}</li>
          </ol>
        </div>

        <!-- Свой отряд -->
        <section class="side side--me" aria-label="Твой отряд">
          <div class="row">
            <button
              v-for="(f, i) in me.fighters"
              :key="i"
              class="fighter"
              :class="{
                'fighter--active': i === me.active,
                'fighter--down': f.hp <= 0,
                'fighter--sel': selected?.kind === 'fighter' && selected.idx === i,
                'fighter--choose': (game.choosing === 0 || (doorCard !== null && i !== me.active)) && f.hp > 0,
              }"
              :style="{ '--el': elColor(CARD_HEROES[f.id].el) }"
              :disabled="f.hp <= 0"
              @click="clickMine(i)"
            >
              <img :src="imgOf(f.id)" :alt="CARD_HEROES[f.id].name" class="fighter-img">
              <span class="hp">{{ f.hp }}</span>
              <span v-if="f.aura" class="aura" :style="{ '--el': elColor(f.aura) }" :title="`Метка: ${CARD_ELEMENTS[f.aura].name}`">{{ CARD_ELEMENTS[f.aura].symbol }}</span>
              <span class="energy"><i v-for="n in CARD_HEROES[f.id].energy" :key="n" :class="{ on: n <= f.energy }" /></span>
              <span class="fighter-name">{{ CARD_HEROES[f.id].name }}</span>
              <span class="pops" aria-hidden="true"><span v-for="(x, k) in popsFor(0, i)" :key="`${fxGen}-${k}`" class="pop" :class="`pop--${x.kind}`" :style="{ animationDelay: `${k * 0.15}s` }">{{ x.text }}</span></span>
<span class="effects" :title="statusTitle(f)">
                <span v-if="f.frozen" class="frost"><span class="frost-flake">❄</span></span>
                <span v-if="f.poison" class="venom" />
                <span v-if="f.shield" class="barrier" />
                <span v-if="f.shield || f.bonus" class="buffs">
                  <span v-if="f.shield" class="buff buff--shield">🛡 щит {{ f.shield }}</span>
                  <span v-if="f.bonus" class="buff buff--atk">⚔ +{{ f.bonus }}</span>
                </span>
                <span v-if="f.poison" class="buff buff--poison">🧪 {{ f.poison }}</span>
              </span>
            </button>
          </div>
          <div class="side-info">
            <span v-if="me.skeleton" class="summon">💀 Скелет Пишеса: бьёт на 1 в конце раунда, {{ roundsLeft(me.skeleton) }}</span>
          </div>
        </section>
      </div>

      <!-- Кубики -->
      <section class="dice" aria-label="Кубики">
        <span class="dice-count">{{ me.dice.length }}</span>
        <button
          v-for="(d, i) in me.dice"
          :key="i"
          class="die"
          :class="{ 'die--pick': rerollPick.includes(i), 'die--match': d === myEl || d === 'omni' }"
          :style="{ '--el': dieColor(d) }"
          :title="dieName(d)"
          :disabled="game.phase !== 'reroll' || !me.rolling"
          @click="toggleReroll(i)"
        >{{ dieSymbol(d) }}</button>
      </section>
    </div>

    <!-- Панель действий -->
    <section v-if="game.phase === 'over'" class="panel">
      <slot name="over" />
    </section>

    <section v-else-if="game.phase === 'reroll'" class="panel">
      <button v-if="me.rolling && game.choosing === null" class="btn btn--primary" @click="act({ type: 'reroll', dice: rerollPick })">
        {{ rerollPick.length ? `Перебросить (${rerollPick.length})` : 'Оставить как есть' }}
      </button>
      <span v-else-if="!me.rolling" class="note">Ждём, пока соперник перебросит кубики…</span>
    </section>

    <template v-else>
      <section class="panel moves">
        <button
          v-for="m in moves"
          :key="m.type"
          class="move"
          :disabled="!myTurn || !can({ type: m.type }).ok"
          :title="can({ type: m.type }).ok ? m.move.text : (can({ type: m.type }) as any).why"
          @click="act({ type: m.type })"
        >
          <span class="move-label">{{ m.label }}</span>
          <span class="move-name">{{ m.move.name }}</span>
          <span class="move-text">{{ m.move.text }}</span>
          <span class="cost"><i v-for="(c, k) in costDots(m.cost, myEl)" :key="k" :style="{ background: c }" /></span>
        </button>
      </section>

      <section v-if="selected?.kind === 'fighter'" class="panel">
        <span>{{ CARD_HEROES[me.fighters[selected.idx]!.id].name }}: </span>
        <button
          class="btn btn--primary btn--sm"
          :disabled="!myTurn || !can({ type: 'switch', to: selected.idx }).ok"
          @click="act({ type: 'switch', to: selected.idx })"
        >Выпустить в бой · {{ SWITCH_COST.any }} кубик</button>
      </section>

      <section v-if="doorCard !== null" class="panel">
        <span>Нажми на героя с рамкой — он выйдет в бой, а ход останется за тобой.</span>
        <button class="btn btn--ghost btn--sm" @click="doorCard = null">Отмена</button>
      </section>

      <section v-if="selected?.kind === 'card' && me.hand[selected.idx]" class="panel">
        <span><b>{{ CARDS[me.hand[selected.idx]!].name }}</b>: {{ CARDS[me.hand[selected.idx]!].text }}</span>
        <button
          class="btn btn--primary btn--sm"
          :disabled="!myTurn || !canPlay(selected.idx)"
          @click="playCard(selected.idx)"
        >Сыграть{{ CARDS[me.hand[selected.idx]!].cost ? ` · ${CARDS[me.hand[selected.idx]!].cost}` : '' }}</button>
        <button
          class="btn btn--ghost btn--sm"
          :disabled="!myTurn || strayDie < 0"
          @click="act({ type: 'tune', card: selected.idx, die: strayDie })"
        >Перекрасить кубик</button>
        <span v-if="tuneHint" class="note tune-hint">{{ tuneHint }}</span>
      </section>

      <section class="panel">
        <button class="btn btn--ghost" :disabled="!myTurn" @click="act({ type: 'end' })">Закончить раунд</button>
      </section>
    </template>

    <!-- Рука -->
    <section class="hand" aria-label="Карты в руке">
      <button
        v-for="{ card: c, idx: i, count } in handGroups"
        :key="c"
        class="card-act"
        :class="{ 'card-act--sel': selected?.kind === 'card' && selected.idx === i, 'card-act--rare': CARDS[c].rare }"
        @click="clickCard(i)"
      >
        <span v-if="CARDS[c].cost" class="card-cost" :title="`Цена: ${CARDS[c].cost}`">{{ CARDS[c].cost }}</span>
        <span v-if="count > 1" class="card-count">×{{ count }}</span>
        <span class="card-kind">{{ CARDS[c].kind }}<template v-if="CARDS[c].rare"> · <b class="rare">редкая</b></template></span>
        <span class="card-name">{{ CARDS[c].name }}</span>
        <span class="card-text">{{ CARDS[c].text }}</span>
      </button>
    </section>
  </div>
</template>

<style scoped>
/* ─── Стол ─── */
.status {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.round {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--ember-soft);
  white-space: nowrap;
}

.banner { flex: 1; font-size: 15px; }
.banner--win { color: var(--success); font-weight: 600; }
.banner--lose { color: var(--danger); font-weight: 600; }

.side {
  padding: 10px;
  border-radius: var(--radius-lg);
  background: var(--fill-faint);
}

.side--foe { margin-bottom: 8px; }

.side-info {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--text-muted);
  min-height: 18px;
}

.side--foe .side-info { margin-bottom: 8px; }
.side--me .side-info { margin-top: 8px; }

.summon { color: #b48ae0; }
.ended { color: var(--ember-soft); }

.row {
  display: flex;
  justify-content: center;
  gap: 10px;
  align-items: flex-end;
}

.fighter {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 132px;
  max-width: calc((100% - 20px) / 3);
  padding: 4px 4px 6px;
  border-radius: var(--radius-md);
  border: 2px solid transparent;
  background: var(--fill);
  color: inherit;
  font: inherit;
  transition: transform .2s ease, border-color .2s ease;
}

button.fighter { cursor: pointer; }

.fighter--active { border-color: var(--el); }
.side--foe .fighter--active { transform: translateY(8px); }
.side--me .fighter--active { transform: translateY(-8px); }
.fighter--sel { box-shadow: 0 0 0 2px var(--ember-soft); }
.fighter--choose { box-shadow: 0 0 0 2px var(--gold); animation: pulse 1.2s ease-in-out infinite; }
.fighter--down { opacity: .35; filter: grayscale(1); }

@keyframes pulse { 50% { box-shadow: 0 0 0 4px var(--gold); } }

.fighter-img {
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

.hp {
  z-index: 1; /* поверх льда и яда на портрете */
  position: absolute;
  top: 8px;
  left: 8px;
  min-width: 28px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  background: #a34a3f;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  text-align: center;
}

.aura {
  z-index: 1; /* поверх льда и яда на портрете */
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-round);
  border: 2px solid var(--el);
  background: color-mix(in srgb, var(--el) 30%, rgba(20, 14, 10, .85));
  color: #fff;
  font-size: 14px;
  line-height: 1;
  box-shadow: 0 0 8px var(--el);
}

.energy { display: flex; gap: 3px; margin-top: 4px; }

.energy i {
  width: 9px;
  height: 9px;
  border-radius: var(--radius-round);
  border: 1px solid var(--gold);
}

.energy i.on { background: var(--gold); }

.fighter-name { font-size: 13px; margin-top: 2px; }

.pops {
  z-index: 2; /* поверх льда и яда на портрете */
  position: absolute;
  top: 30%;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: none;
}

.pop {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: rgba(20, 14, 10, .85);
  font-weight: 700;
  font-size: 18px;
  white-space: nowrap;
  opacity: 0;
  animation: pop 1.6s ease-out forwards;
}

.pop--dmg { color: #ff8a7a; font-size: 22px; }
.pop--heal { color: var(--success); }
.pop--shield { color: #9cc3e8; font-size: 14px; }
.pop--note { color: var(--gold); font-size: 13px; }

@keyframes pop {
  0% { opacity: 0; transform: translateY(8px) scale(.8); }
  15% { opacity: 1; transform: translateY(0) scale(1.1); }
  30% { transform: scale(1); }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-14px); }
}
/* Эффекты поверх портрета — слой ровно по картинке (отступ карточки 4px). */
.effects {
  position: absolute;
  top: 4px;
  left: 4px;
  right: 4px;
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-sm);
  overflow: hidden;
  pointer-events: none;
}

.effects[title] { pointer-events: auto; }

/* Заморозка — портрет под коркой льда. */
.frost {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border: 2px solid rgba(210, 240, 255, .9);
  border-radius: inherit;
  background:
    repeating-linear-gradient(115deg, transparent 0 14px, rgba(255, 255, 255, .18) 14px 15px),
    repeating-linear-gradient(35deg, transparent 0 22px, rgba(255, 255, 255, .14) 22px 23px),
    linear-gradient(180deg, rgba(190, 230, 255, .55), rgba(120, 180, 230, .6));
  box-shadow: inset 0 0 22px rgba(225, 245, 255, .95);
}

.frost-flake {
  font-size: 44px;
  color: #fff;
  opacity: .85;
  text-shadow: 0 0 10px #9fd6ff;
}

/* Яд — зелёная дымка поднимается снизу. */
.venom {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 92%, rgba(170, 230, 80, .55) 0 10%, transparent 11%),
    radial-gradient(circle at 70% 85%, rgba(170, 230, 80, .45) 0 7%, transparent 8%),
    radial-gradient(circle at 45% 75%, rgba(170, 230, 80, .35) 0 5%, transparent 6%),
    linear-gradient(to top, rgba(95, 160, 30, .75), rgba(95, 160, 30, .25) 45%, transparent 70%);
  animation: venom 2.4s ease-in-out infinite alternate;
}

@keyframes venom {
  from { opacity: .75; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .venom { animation: none; }
}

/* Значки с числами: щит и удар — слева внизу, яд — справа внизу. */
.buffs {
  position: absolute;
  left: 4px;
  bottom: 4px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}

.buff {
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: rgba(20, 14, 10, .85);
  border: 1px solid currentColor;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
}

/* Щит — светящийся голубой пузырь поверх портрета, как в оригинале. */
.barrier {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 2px solid rgba(140, 200, 255, .95);
  background: radial-gradient(ellipse at center, transparent 55%, rgba(120, 190, 255, .35) 100%);
  box-shadow: inset 0 0 16px rgba(140, 200, 255, .9);
  animation: barrier 2s ease-in-out infinite alternate;
}

@keyframes barrier {
  from { box-shadow: inset 0 0 10px rgba(140, 200, 255, .7); }
  to { box-shadow: inset 0 0 20px rgba(160, 215, 255, 1); }
}

@media (prefers-reduced-motion: reduce) {
  .barrier { animation: none; }
}

.buff--shield { color: #bfe0ff; border-color: #8cc8ff; background: rgba(20, 50, 90, .9); }
.buff--atk { color: var(--ember-soft); }

.buff--poison {
  position: absolute;
  right: 4px;
  bottom: 4px;
  color: #b5e26a;
}

.log {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin: 8px 0;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  background: var(--fill-faint);
  font-size: 13px;
}

.log-last {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--parchment);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-toggle {
  border: 0;
  background: none;
  padding: 2px 0;
  color: var(--ember-soft);
  font: inherit;
  cursor: pointer;
  text-decoration: underline dotted;
}

.log-list {
  flex-basis: 100%;
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  max-height: 160px;
  overflow-y: auto;
  color: var(--text-muted);
}

.field {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-bottom: 12px;
}

.arena { min-width: 0; }

.dice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 6px;
  border-radius: var(--radius-lg);
  background: var(--fill-faint);
  align-self: center;
}

.dice-count {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--ember-soft);
  margin-bottom: 2px;
}

.die {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  border: 2px solid var(--el);
  background: color-mix(in srgb, var(--el) 25%, transparent);
  color: var(--parchment);
  font: inherit;
  font-weight: 700;
  opacity: .7;
}

.die--match { opacity: 1; }
.die:not(:disabled) { cursor: pointer; }
.die--pick { transform: translateX(-6px) rotate(20deg); box-shadow: 0 0 0 2px var(--parchment); }

.tune-hint { font-size: 13px; }

.panel {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  font-size: 14px;
}

.moves {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.move {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  padding: 8px;
  border-radius: var(--radius-md);
  border: 1px solid var(--line-strong, rgba(241, 230, 210, .2));
  background: var(--fill);
  color: inherit;
  font: inherit;
  cursor: pointer;
  height: 100%;
}

.move:hover:not(:disabled) { background: var(--fill-bold); }
.move:disabled { opacity: .45; cursor: default; }
.move-label { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: var(--ember-soft); }
.move-name { font-weight: 600; font-size: 14px; }
.move-text { font-size: 12px; color: var(--text-muted); line-height: 1.35; flex: 1; }

.cost { display: flex; gap: 3px; margin-top: 4px; }
.cost i { width: 10px; height: 10px; border-radius: 3px; }

.hand {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 12px 8px;
  padding-top: 8px; /* место под кружок цены */
}

.card-act {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  padding: 10px 8px 8px;
  min-height: 120px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(201, 160, 46, .5);
  background: linear-gradient(180deg, #3a2d22, #2b221c);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.card-act--sel { border-color: var(--ember-soft); transform: translateY(-6px); box-shadow: 0 6px 14px rgba(0, 0, 0, .4); }

.card-cost {
  position: absolute;
  top: -6px;
  left: -6px;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-round);
  background: var(--gold);
  color: var(--ink);
  font-weight: 700;
  font-size: 13px;
  display: grid;
  place-items: center;
}

.card-act--rare {
  border-color: var(--gold);
  background: linear-gradient(180deg, #4a3a1e, #2b221c);
  box-shadow: 0 0 10px rgba(201, 160, 46, .35);
}

.rare { color: var(--gold); font-weight: 700; }

.card-count {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--gold);
}

.card-kind { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: var(--ember-soft); }
.card-name { font-family: var(--font-display); font-size: 15px; line-height: 1.2; }
.card-text { font-size: 11px; color: var(--text-muted); line-height: 1.35; }

.note { color: var(--text-muted); font-size: 14px; }

/* Победитель — по центру поля, крупно; нажатие закрывает. */
.win {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 6;
  display: grid;
  justify-items: center;
  gap: 4px;
  max-width: calc(100% - 24px);
  padding: 16px 28px 18px;
  border-radius: var(--radius-lg);
  background: rgba(20, 14, 10, .92);
  border: 1px solid var(--gold);
  box-shadow: 0 10px 30px rgba(0, 0, 0, .55);
  color: var(--parchment);
  font: inherit;
  cursor: pointer;
  animation: win-in .45s ease-out;
}

.win--lose { border-color: var(--danger); }
.win-title { font-family: var(--font-display); font-size: 26px; color: var(--gold); }
.win--lose .win-title { color: var(--danger); }
.win-name { font-size: 20px; font-weight: 600; overflow-wrap: anywhere; text-align: center; }
.win-hint { font-size: 13px; color: var(--text-muted); }

@keyframes win-in {
  from { opacity: 0; transform: translate(-50%, -50%) scale(.85); }
}

@media (prefers-reduced-motion: reduce) {
  .win { animation: none; }
}

@media (max-width: 560px) {
  .win { padding: 10px 16px 12px; }
  .win-title { font-size: 20px; }
  .win-name { font-size: 16px; }
  .moves { grid-template-columns: 1fr; }
  .move-text { display: none; }
}
</style>
