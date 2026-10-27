<script setup lang="ts">
/**
 * Карточная игра «Таверна» против компьютера. Правила и ход соперника — в
 * shared/utils/cards.ts; страница только показывает партию и шлёт ходы.
 * Партия живёт в браузере: сервер про неё не знает.
 */
import {
  CARD_HEROES, CARD_HERO_IDS, CARDS, CARD_ELEMENTS, ATTACK_COST, SKILL_COST, BURST_COST, SWITCH_COST,
  newCardsGame, randomCardsTeam, cardsApply, cardsCheck, cardsComputerMove, cardsActive, dieColor, dieName, dieSymbol,
  type Game, type Fx, type HeroId, type CardId, type Action, type Cost, type Element, type Fighter,
} from '#shared/utils/cards'

const { data: settings } = await useFetch('/api/settings')

useHead({ title: 'Карты таверны · Странствующая Таверна', meta: [{ name: 'robots', content: 'noindex' }] })

// ─── Выбор отряда ──────────────────────────────────────────
const picked = ref<HeroId[]>([])
function togglePick(id: HeroId) {
  const i = picked.value.indexOf(id)
  if (i >= 0) picked.value.splice(i, 1)
  else if (picked.value.length < 3) picked.value.push(id)
}

// ─── Партия ────────────────────────────────────────────────
const game = shallowRef<Game | null>(null)
const selected = ref<{ kind: 'fighter' | 'card'; idx: number } | null>(null)
const rerollPick = ref<number[]>([])

function start() {
  const seed = Date.now()
  game.value = newCardsGame([...picked.value], randomCardsTeam(seed + 1), seed)
  selected.value = null
  rerollPick.value = []
}

function leave() {
  game.value = null
  selected.value = null
}

function act(a: Action) {
  if (!game.value) return
  game.value = cardsApply(game.value, 0, a)
  selected.value = null
  rerollPick.value = []
}

const me = computed(() => game.value?.players[0])
const foe = computed(() => game.value?.players[1])
const myActive = computed(() => (me.value ? cardsActive(me.value) : null))
const myEl = computed(() => (myActive.value ? CARD_HEROES[myActive.value.id].el : 'steel'))
const myTurn = computed(() => {
  const g = game.value
  return !!g && g.phase === 'action' && g.choosing === null && g.turn === 0 && !g.players[0].ended
})

const can = (a: Action) => (game.value ? cardsCheck(game.value, 0, a) : { ok: false as const, why: '' })

// Всплывающие цифры: что случилось за последний ход. Поколение меняет ключи,
// чтобы анимация шла заново, даже если цифры те же.
const fx = shallowRef<Fx[]>([])
const fxGen = ref(0)
let fxTimer: ReturnType<typeof setTimeout> | null = null
watch(game, (g) => {
  if (!g?.fx.length) return
  fx.value = g.fx
  fxGen.value++
  if (fxTimer) clearTimeout(fxTimer)
  fxTimer = setTimeout(() => { fx.value = [] }, 2400)
})
const popsFor = (side: 0 | 1, idx: number) => fx.value.filter(x => x.side === side && x.idx === idx)

// Ход компьютера — с паузой, чтобы было видно, что он делает.
let timer: ReturnType<typeof setTimeout> | null = null
watch(game, (g) => {
  if (timer) clearTimeout(timer)
  if (!g || g.phase !== 'action' || g.choosing !== null || g.turn !== 1) return
  timer = setTimeout(() => {
    const cur = game.value
    if (cur) game.value = cardsApply(cur, 1, cardsComputerMove(cur))
  }, 750)
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
  if (fxTimer) clearTimeout(fxTimer)
})

// ─── Действия по выбранному ───────────────────────────────
function clickMine(idx: number) {
  const g = game.value
  if (!g) return
  if (g.choosing === 0) return act({ type: 'choose', to: idx })
  if (idx === g.players[0].active) return
  selected.value = selected.value?.kind === 'fighter' && selected.value.idx === idx ? null : { kind: 'fighter', idx }
}

function clickCard(idx: number) {
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

/** Кубик под обмен: первый, что не подходит активному герою. */
const strayDie = computed(() => me.value?.dice.findIndex(d => d !== myEl.value && d !== 'omni') ?? -1)

function toggleReroll(i: number) {
  const k = rerollPick.value.indexOf(i)
  if (k >= 0) rerollPick.value.splice(k, 1)
  else rerollPick.value.push(i)
}

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

const statusTags = (f: Fighter) => [
  f.shield ? `Щит ${f.shield}` : '',
  f.bonus ? `+${f.bonus} к удару` : '',
  f.poison ? `Яд ${f.poison}` : '',
  f.frozen ? 'Заморожен' : '',
].filter(Boolean)

const recentLog = computed(() => (game.value?.log ?? []).slice(-6).reverse())

const banner = computed(() => {
  const g = game.value
  if (!g) return ''
  if (g.phase === 'over') return g.winner === 0 ? 'Победа! Таверна празднует.' : 'Поражение. Ещё партию?'
  if (g.choosing === 0) return 'Твой герой пал — выбери, кто выйдет в бой'
  if (g.phase === 'reroll') return 'Отметь кубики, которые хочешь перебросить'
  if (g.players[0].ended) return 'Ты закончил раунд — соперник доигрывает'
  return g.turn === 0 ? 'Твой ход' : 'Ходит соперник…'
})
</script>

<template>
  <div class="page">
    <AppHeader
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />

    <!-- ─── Выбор отряда ─── -->
    <main v-if="!game" class="lobby">
      <header class="intro">
        <div class="eyebrow">Карточная игра · The Wandering Inn</div>
        <h1 class="page-title title">Карты таверны</h1>
        <p class="lead">
          Собери отряд из трёх героев и сразись с компьютером. Кубики стихий — твой ресурс:
          ими платят за удары, навыки и карты. Стихии сталкиваются и дают реакции.
        </p>
      </header>

      <h2 class="section-title display">Выбери троих · {{ picked.length }}/3</h2>
      <ul class="roster">
        <li v-for="id in CARD_HERO_IDS" :key="id">
          <button
            class="pick"
            :class="{ 'pick--on': picked.includes(id) }"
            :style="{ '--el': elColor(CARD_HEROES[id].el) }"
            :aria-pressed="picked.includes(id)"
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

      <div class="actions">
        <button class="btn btn--primary" :disabled="picked.length !== 3" @click="start">В бой</button>
      </div>

      <details class="rules card card--panel">
        <summary>Правила</summary>
        <ul>
          <li>В начале раунда у тебя 8 кубиков; их можно один раз перебросить. Грани — стихии твоего отряда и золотой «Любой».</li>
          <li>Атака: 1 кубик стихии героя + 1 любой. Навык: 3 кубика стихии. Ульта: 3 кубика стихии и полная энергия — она копится от атак и навыков.</li>
          <li>Сменить героя стоит 1 кубик. Карту можно сыграть или обменять на кубик стихии активного героя.</li>
          <li>Удары, навыки, смена героя и «конец раунда» передают ход сопернику; карты и обмен — нет.</li>
          <li>Раунд кончается, когда оба сказали «конец». Кто закончил первым, тот начинает следующий.</li>
          <li>Реакции: Огонь + Лёд — Таяние (+2 урона). Огонь + Яд — Взрыв (+1 и по 1 остальным). Магия + Яд — Нейтрализация (+1, снимает щиты и усиления). Ветер разносит чужую стихию на остальных врагов. Сталь стихию не оставляет.</li>
          <li>Побеждает тот, кто выведет из боя всех трёх героев соперника.</li>
        </ul>
      </details>
    </main>

    <!-- ─── Партия ─── -->
    <main v-else-if="me && foe" class="table">
      <div class="status">
        <span class="round">Раунд {{ game.round }}</span>
        <span class="banner" :class="{ 'banner--win': game.winner === 0, 'banner--lose': game.winner === 1 }">{{ banner }}</span>
        <button class="btn btn--ghost btn--sm" @click="leave">Выйти</button>
      </div>

      <!-- Поле и кубики справа, как в оригинале -->
      <div class="field">
        <div class="arena">
          <!-- Соперник -->
          <section class="side side--foe" aria-label="Отряд соперника">
            <div class="side-info">
              <span>Карт: {{ foe.hand.length }} · Кубиков: {{ foe.dice.length }}</span>
              <span v-if="foe.skeleton" class="summon">Скелет · {{ foe.skeleton }}</span>
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
                <span v-if="f.aura" class="aura" :style="{ background: elColor(f.aura) }" :title="`Метка: ${CARD_ELEMENTS[f.aura].name}`" />
                <span class="energy"><i v-for="n in CARD_HEROES[f.id].energy" :key="n" :class="{ on: n <= f.energy }" /></span>
                <span class="fighter-name">{{ CARD_HEROES[f.id].name }}</span>
                <span class="pops" aria-hidden="true"><span v-for="(x, k) in popsFor(1, i)" :key="`${fxGen}-${k}`" class="pop" :class="`pop--${x.kind}`" :style="{ animationDelay: `${k * 0.15}s` }">{{ x.text }}</span></span>
                <span v-if="statusTags(f).length" class="tags">{{ statusTags(f).join(' · ') }}</span>
              </div>
            </div>
          </section>

          <ol class="log" aria-live="polite">
            <li v-for="(line, i) in recentLog" :key="game.log.length - i">{{ line }}</li>
          </ol>

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
                  'fighter--choose': game.choosing === 0 && f.hp > 0,
                }"
                :style="{ '--el': elColor(CARD_HEROES[f.id].el) }"
                :disabled="f.hp <= 0"
                @click="clickMine(i)"
              >
                <img :src="imgOf(f.id)" :alt="CARD_HEROES[f.id].name" class="fighter-img">
                <span class="hp">{{ f.hp }}</span>
                <span v-if="f.aura" class="aura" :style="{ background: elColor(f.aura) }" :title="`Метка: ${CARD_ELEMENTS[f.aura].name}`" />
                <span class="energy"><i v-for="n in CARD_HEROES[f.id].energy" :key="n" :class="{ on: n <= f.energy }" /></span>
                <span class="fighter-name">{{ CARD_HEROES[f.id].name }}</span>
                <span class="pops" aria-hidden="true"><span v-for="(x, k) in popsFor(0, i)" :key="`${fxGen}-${k}`" class="pop" :class="`pop--${x.kind}`" :style="{ animationDelay: `${k * 0.15}s` }">{{ x.text }}</span></span>
                <span v-if="statusTags(f).length" class="tags">{{ statusTags(f).join(' · ') }}</span>
              </button>
            </div>
            <div class="side-info">
              <span v-if="me.skeleton" class="summon">Скелет · {{ me.skeleton }}</span>
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
            :disabled="game.phase !== 'reroll'"
            @click="toggleReroll(i)"
          >{{ dieSymbol(d) }}</button>
        </section>
      </div>

      <!-- Панель действий -->
      <section v-if="game.phase === 'over'" class="panel">
        <button class="btn btn--primary" @click="start">Ещё партия тем же отрядом</button>
        <button class="btn btn--ghost" @click="leave">Сменить отряд</button>
      </section>

      <section v-else-if="game.phase === 'reroll' && game.choosing === null" class="panel">
        <button class="btn btn--primary" @click="act({ type: 'reroll', dice: rerollPick })">
          {{ rerollPick.length ? `Перебросить (${rerollPick.length})` : 'Оставить как есть' }}
        </button>
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

        <section v-if="selected?.kind === 'card' && me.hand[selected.idx]" class="panel">
          <span><b>{{ CARDS[me.hand[selected.idx]!].name }}</b>: {{ CARDS[me.hand[selected.idx]!].text }}</span>
          <button
            class="btn btn--primary btn--sm"
            :disabled="!myTurn || !can({ type: 'play', card: selected.idx }).ok"
            @click="act({ type: 'play', card: selected.idx })"
          >Сыграть{{ CARDS[me.hand[selected.idx]!].cost ? ` · ${CARDS[me.hand[selected.idx]!].cost}` : '' }}</button>
          <button
            class="btn btn--ghost btn--sm"
            :disabled="!myTurn || strayDie < 0"
            @click="act({ type: 'tune', card: selected.idx, die: strayDie })"
          >Обменять на кубик</button>
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
          :class="{ 'card-act--sel': selected?.kind === 'card' && selected.idx === i }"
          @click="clickCard(i)"
        >
          <span v-if="CARDS[c].cost" class="card-cost" :title="`Цена: ${CARDS[c].cost}`">{{ CARDS[c].cost }}</span>
          <span v-if="count > 1" class="card-count">×{{ count }}</span>
          <span class="card-kind">{{ CARDS[c].kind }}</span>
          <span class="card-name">{{ CARDS[c].name }}</span>
          <span class="card-text">{{ CARDS[c].text }}</span>
        </button>
      </section>
    </main>

    <AppFooter on-dark :settings="settings as any" />
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg-dark);
  color: var(--parchment);
  display: flex;
  flex-direction: column;
}

.lobby,
.table {
  flex: 1;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 96px 16px 48px;
}

.intro { margin-bottom: 24px; }

.eyebrow {
  font-size: 12px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ember-soft);
  margin-bottom: 12px;
}

.title { margin: 0 0 12px; }

.lead {
  margin: 0;
  max-width: 640px;
  color: var(--text-muted);
  line-height: 1.6;
}

.section-title {
  margin: 28px 0 12px;
  font-size: 22px;
}

.note { color: var(--text-muted); font-size: 14px; }

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

.actions { margin: 20px 0; }

.rules { margin-top: 12px; font-size: 14px; line-height: 1.55; }
.rules summary { cursor: pointer; font-weight: 600; }
.rules ul { margin: 10px 0 0; padding-left: 18px; color: var(--text-muted); }

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
  position: absolute;
  top: 10px;
  right: 10px;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-round);
  box-shadow: 0 0 0 2px var(--bg-dark);
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
.tags { font-size: 11px; color: var(--ember-soft); text-align: center; }

.log {
  list-style: none;
  margin: 8px 0;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--fill-faint);
  font-size: 13px;
  color: var(--text-muted);
  min-height: 60px;
  max-height: 110px;
  overflow-y: auto;
}

.log li:first-child { color: var(--parchment); }

.field {
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

@media (max-width: 560px) {
  .lobby, .table { padding-top: 80px; }
  .moves { grid-template-columns: 1fr; }
  .move-text { display: none; }
}
</style>
