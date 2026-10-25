<script setup lang="ts">
// Импортируем явно, а не через автоимпорт: новый экспорт из shared/ попадает в
// сгенерированный список не сразу, и в шаблоне он оказывается undefined.
import {
  BOARD_CELLS,
  BOARD_CHAT_MAX,
  BOARD_LAST,
  BOARD_SKILLS,
  effectLabel,
  jumpTarget,
  type BoardAction,
  type BoardEffect,
  type BoardSkill,
} from '#shared/utils/board'
import { boardArrows } from '~/utils/boardArrows'

definePageMeta({ middleware: 'signed-in' })

const route = useRoute()
const code = String(route.params.code ?? '').toUpperCase()

const { data: settings } = await useFetch('/api/settings')
const { state, chat, you, connected, fatal, notice, start, roll, useSkill: playSkill, say, leave } = useBoardRoom(code)

const players = computed(() => state.value?.players ?? [])
const me = computed(() => players.value.find(p => p.slot === you.value) ?? null)
const isHost = computed(() => state.value?.hostSlot === you.value)
const playerBySlot = (slot: number | null | undefined) => players.value.find(p => p.slot === slot) ?? null
const turnPlayer = computed(() => playerBySlot(state.value?.turnSlot))
const winner = computed(() => playerBySlot(state.value?.winnerSlot))

// ── Анимация хода ────────────────────────────────────────
// На экране фишки стоят не там, где их держит сервер, а там, куда успела
// доехать анимация: ход приходит сразу целиком, а показать его надо по шагам.
const shown = reactive<Record<number, number>>({})
const shownSkinner = ref<number | null>(null)
const animating = ref(false)
const diceFace = ref(1)
/** Второй кубик — когда сыгран [Безупречный бросок]. */
const diceFace2 = ref<number | null>(null)
const diceRolling = ref(false)
/** Что ещё случилось за последнее действие: навыки, Скиннер, встречи. */
const notes = ref<string[]>([])
/** Клетка, на которую пришли по кубику последней, — её текст у кубика. */
const landedCell = ref<number | null>(null)
const landedSlot = ref<number | null>(null)
const pickedCell = ref<number | null>(null)
/** Фишка, которая сейчас летит по стрелке, — ей переход медленнее. */
const jumpingSlot = ref<number | null>(null)

const reducedMotion = import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const wait = (ms: number) => new Promise(r => setTimeout(r, reducedMotion ? 0 : ms))

let seenAction = 0
let queue: Promise<void> = Promise.resolve()

function syncPositions() {
  for (const p of players.value) shown[p.slot] = p.pos
  shownSkinner.value = state.value?.skinner ?? null
}

/** Отброс или прыжок — фишка летит одним махом, медленнее обычного шага. */
async function fly(slot: number, to: number) {
  jumpingSlot.value = slot
  shown[slot] = to
  await wait(750)
  jumpingSlot.value = null
}

/** Проиграть действие по шагам, которые прислал сервер. */
async function play(action: BoardAction) {
  animating.value = true
  notes.value = []

  for (const fx of action.fx) {
    if (fx.kind === 'dice') {
      diceRolling.value = true
      for (let i = 0; i < 8; i++) {
        diceFace.value = 1 + Math.floor(Math.random() * 6)
        if (fx.values.length > 1) diceFace2.value = 1 + Math.floor(Math.random() * 6)
        await wait(70)
      }
      diceFace.value = fx.values[0]!
      diceFace2.value = fx.values[1] ?? null
      diceRolling.value = false
      await wait(250)
    } else if (fx.kind === 'walk') {
      for (const cell of fx.cells) {
        shown[fx.slot] = cell
        await wait(230)
      }
      landedCell.value = action.landed
      landedSlot.value = action.slot
      pickedCell.value = null
    } else if (fx.kind === 'jump' || fx.kind === 'push') {
      await wait(fx.kind === 'jump' ? 700 : 500)
      await fly(fx.slot, fx.to)
    } else if (fx.kind === 'skinner') {
      await wait(400)
      shownSkinner.value = fx.to
      await wait(650)
    }
  }

  notes.value = action.notes
  animating.value = false
  syncPositions()
}

watch(state, (s) => {
  if (!s) return
  const action = s.lastAction
  // Первое состояние после входа показываем как есть: старый ход уже сыгран.
  if (!seenAction) {
    seenAction = action?.id ?? -1
    syncPositions()
    if (action) {
      const dice = action.fx.find(f => f.kind === 'dice')
      if (dice?.kind === 'dice') {
        diceFace.value = dice.values[0]!
        diceFace2.value = dice.values[1] ?? null
      }
      landedCell.value = action.landed
      landedSlot.value = action.slot
      notes.value = action.notes
    }
    return
  }
  if (action && action.id !== seenAction) {
    seenAction = action.id
    queue = queue.then(() => play(action))
  } else if (!animating.value) {
    syncPositions()
  }
})

/** Просьба ушла на сервер, ответа ещё нет. Без этого кнопка оставалась
 *  живой до ответа, и быстрый двойной клик бросал кубик дважды. Ответ —
 *  новое состояние или ошибка — снимает флаг. */
const waiting = ref(false)
watch([state, notice, connected], () => { waiting.value = false })

function ask(send: () => void) {
  waiting.value = true
  send()
}

const myTurn = computed(() =>
  state.value?.status === 'playing' && state.value.turnSlot === you.value
  && !animating.value && !waiting.value && connected.value)
const canRoll = myTurn
const rollDice = () => { if (canRoll.value) ask(roll) }

// ── Навыки ──────────────────────────────────────────────
const canPlaySkill = computed(() => myTurn.value && !state.value?.skillUsed)
/** Выбираем, с кем драться: [Трактирная драка] нужна цель. */
const pickingBrawl = ref(false)
const rivals = computed(() => players.value.filter(p => p.slot !== you.value && !p.left))

function onSkill(skill: BoardSkill) {
  if (skill === 'brawl') {
    // Соперник один — выбирать не из кого.
    if (rivals.value.length === 1) ask(() => playSkill('brawl', rivals.value[0]!.slot))
    else pickingBrawl.value = !pickingBrawl.value
    return
  }
  ask(() => playSkill(skill))
}

function brawlWith(slot: number) {
  pickingBrawl.value = false
  ask(() => playSkill('brawl', slot))
}

watch(canPlaySkill, (can) => { if (!can) pickingBrawl.value = false })

// ── Карта ───────────────────────────────────────────────
// Схема рисуется в координатах 160×110 — в пропорциях самой карты, 16:11.
// Тогда SVG тянется без искажений, и наконечники стрелок не плющит.
const SX = 1.6
const SY = 1.1
const pathPoints = BOARD_CELLS.map(c => `${c.x * SX},${c.y * SY}`).join(' ')

/** Стрелки прыжков в обход чужих клеток. Подбор изгиба — заметная работа
 *  для слабого телефона, поэтому считает сервер при отрисовке страницы, а
 *  браузер получает готовое в данных страницы. */
const arrows = useState('board-arrows', () => boardArrows(BOARD_CELLS, jumpTarget, SX, SY))

const effectClass = (e: BoardEffect) => `cell--${e.kind}`

/** Несколько фишек на одной клетке расходятся по углам, чтобы не прятать друг друга. */
function pawnStyle(slot: number) {
  const cell = BOARD_CELLS[shown[slot] ?? 0]!
  const dx = slot % 2 ? 1.8 : -1.8
  const dy = slot < 2 ? -2.6 : 2.6
  return { left: `${cell.x + dx}%`, top: `${cell.y + dy}%` }
}

const skinnerStyle = computed(() => {
  const cell = BOARD_CELLS[shownSkinner.value ?? 0]!
  return { left: `${cell.x}%`, top: `${cell.y - 5.5}%` }
})

const infoCell = computed(() => pickedCell.value ?? landedCell.value)
const infoWho = computed(() => (pickedCell.value === null ? playerBySlot(landedSlot.value) : null))

// ── Чат ────────────────────────────────────────────────
const draft = ref('')
const chatEl = ref<HTMLElement | null>(null)

function sendChat() {
  const text = draft.value.trim()
  if (!text) return
  say(text)
  draft.value = ''
}

watch(() => chat.value.length, async () => {
  await nextTick()
  chatEl.value?.scrollTo({ top: chatEl.value.scrollHeight })
})

// ── Прочее ─────────────────────────────────────────────
const copied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(`${location.origin}/board/${code}`)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {}
}

async function leaveTable() {
  leave()
  await navigateTo('/board')
}

const time = (at: number) => new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

useHead({ title: `Стол ${code} · Дорога через таверну`, meta: [{ name: 'robots', content: 'noindex' }] })
</script>

<template>
  <div class="page">
    <AppHeader
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />

    <main class="room">
      <div class="top">
        <NuxtLink to="/board" class="back">← Все столы</NuxtLink>
        <div class="top-right">
          <span class="code">Стол {{ code }}</span>
          <button class="btn btn--ghost btn--sm" @click="copyLink">{{ copied ? 'Ссылка скопирована' : 'Позвать по ссылке' }}</button>
        </div>
      </div>

      <section v-if="fatal" class="card card--panel fatal">
        <p>{{ fatal }}</p>
        <NuxtLink to="/board" class="btn btn--primary btn--sm">К столам</NuxtLink>
      </section>

      <p v-else-if="!state" class="note">Подключаемся к таверне…</p>

      <div v-else class="layout">
        <div class="board-col">
          <div class="map" role="img" :aria-label="`Карта: ${BOARD_CELLS.length} клеток`">
            <svg class="path" viewBox="0 0 160 110" aria-hidden="true">
              <defs>
                <marker id="arrow-fwd" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.5" markerHeight="3.5" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" class="head head--fwd" />
                </marker>
                <marker id="arrow-back" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.5" markerHeight="3.5" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" class="head head--back" />
                </marker>
              </defs>
              <polyline :points="pathPoints" class="road" />
              <path
                v-for="a in arrows"
                :key="a.from"
                :d="a.d"
                class="arrow"
                :class="a.forward ? 'arrow--fwd' : 'arrow--back'"
                :marker-end="a.forward ? 'url(#arrow-fwd)' : 'url(#arrow-back)'"
              />
            </svg>

            <button
              v-for="(cell, i) in BOARD_CELLS"
              :key="i"
              class="cell"
              :class="[effectClass(cell.effect), { 'cell--start': i === 0, 'cell--finish': i === BOARD_LAST, 'cell--picked': i === infoCell }]"
              :style="{ left: `${cell.x}%`, top: `${cell.y}%` }"
              :title="cell.text"
              @click="pickedCell = i"
            >
              {{ i === BOARD_LAST ? '★' : i + 1 }}
              <span v-if="cell.skill" class="cell-skill" aria-hidden="true" />
            </button>

            <div
              v-if="shownSkinner !== null"
              class="skinner"
              :style="skinnerStyle"
              title="Скиннер: идёт к таверне, кого встретит — отбросит на 3 назад"
            >
              <span class="skinner-eye" /><span class="skinner-eye" />
            </div>

            <div
              v-for="p in players"
              :key="p.slot"
              class="pawn"
              :class="{ 'pawn--left': p.left, 'pawn--turn': p.slot === state.turnSlot, 'pawn--jump': p.slot === jumpingSlot }"
              :style="{ ...pawnStyle(p.slot), '--pawn': p.color }"
              :title="p.name"
            >
              <UserAvatar :src="p.avatarUrl" :name="p.name" :size="26" alt="" />
            </div>
          </div>

          <ul class="legend">
            <li><span class="legend-cell cell--forward" /> вперёд по стрелке</li>
            <li><span class="legend-cell cell--back" /> назад по стрелке</li>
            <li><span class="legend-cell cell--again" /> ещё бросок</li>
            <li><span class="legend-cell cell--skip" /> пропуск хода</li>
            <li><span class="legend-cell"><span class="cell-skill" /></span> даёт навык</li>
            <li>
              <span class="skinner legend-skinner"><span class="skinner-eye" /><span class="skinner-eye" /></span>
              Скиннер — отбросит на 3
            </li>
          </ul>
        </div>

        <aside class="side">
          <section class="card card--panel turn">
            <template v-if="state.status === 'lobby'">
              <p class="turn-title">Ждём игроков</p>
              <p class="muted">За столом {{ players.length }} из 4. Позови друзей по ссылке, а хозяин стола начнёт партию.</p>
              <button v-if="isHost" class="btn btn--primary" :disabled="!connected" @click="start">Начать партию</button>
              <p v-else class="muted">Партию начнёт {{ playerBySlot(state.hostSlot)?.name ?? 'хозяин стола' }}.</p>
            </template>

            <template v-else-if="state.status === 'playing'">
              <div class="dice-row">
                <div class="dice-pair" aria-live="polite">
                  <div class="dice" :class="{ 'dice--rolling': diceRolling }">
                    <span v-for="n in 9" :key="n" class="pip" :class="`pip--${n}`" :data-face="diceFace" />
                  </div>
                  <div v-if="diceFace2 !== null" class="dice" :class="{ 'dice--rolling': diceRolling }">
                    <span v-for="n in 9" :key="n" class="pip" :class="`pip--${n}`" :data-face="diceFace2" />
                  </div>
                </div>
                <div>
                  <p class="turn-title">
                    <template v-if="turnPlayer?.slot === you">Твой ход</template>
                    <template v-else>Ходит {{ turnPlayer?.name }}</template>
                  </p>
                  <p v-if="me?.skip" class="muted">Ты пропускаешь ходов: {{ me.skip }}</p>
                  <p v-if="me?.doubleNext" class="muted">Следующий бросок — двумя кубиками</p>
                </div>
              </div>
            </template>

            <template v-else>
              <p class="turn-title">Партия окончена</p>
              <p v-if="winner" class="muted">Побеждает {{ winner.name }}!</p>
            </template>

            <!-- Текст клетки — здесь, рядом с кубиком, а не под картой: карта
                 занимает почти весь экран, и под ней его никто не видел. -->
            <div v-if="state.status !== 'lobby' && infoCell !== null" class="cell-info" aria-live="polite">
              <div class="cell-info-head">
                Клетка {{ infoCell + 1 }}
                <template v-if="infoWho"> · ход игрока {{ infoWho.name }}</template>
                <span v-if="effectLabel(BOARD_CELLS[infoCell]!.effect)" class="effect-chip">
                  {{ effectLabel(BOARD_CELLS[infoCell]!.effect) }}
                </span>
              </div>
              <p class="cell-info-text">{{ BOARD_CELLS[infoCell]!.text }}</p>
              <p v-if="BOARD_CELLS[infoCell]!.skill" class="cell-info-skill">
                Даёт навык {{ BOARD_SKILLS[BOARD_CELLS[infoCell]!.skill!].name }}
              </p>
            </div>

            <ul v-if="notes.length && state.status !== 'lobby'" class="notes" aria-live="polite">
              <li v-for="(n, i) in notes" :key="i">{{ n }}</li>
            </ul>

            <button v-if="state.status === 'playing'" class="btn btn--primary roll" :disabled="!canRoll" @click="rollDice">
              Бросить кубик
            </button>

            <div v-if="state.status === 'playing' && me?.skills.length" class="skills">
              <p class="skills-title">Твои навыки</p>
              <div v-for="(s, i) in me.skills" :key="`${s}-${i}`" class="skill">
                <div class="skill-text">
                  <span class="skill-name">{{ BOARD_SKILLS[s].name }}</span>
                  <span class="skill-hint">{{ BOARD_SKILLS[s].hint }}</span>
                </div>
                <button
                  v-if="s !== 'danger'"
                  class="btn btn--ghost btn--sm"
                  :disabled="!canPlaySkill || (s === 'double' && me.doubleNext) || (s === 'brawl' && !rivals.length)"
                  @click="onSkill(s)"
                >
                  Сыграть
                </button>
              </div>
              <div v-if="pickingBrawl" class="brawl-pick">
                <span class="skill-hint">С кем драться?</span>
                <button v-for="r in rivals" :key="r.slot" class="btn btn--ghost btn--sm" @click="brawlWith(r.slot)">
                  <span class="dot" :style="{ background: r.color }" /> {{ r.name }}
                </button>
              </div>
            </div>
            <NuxtLink v-else-if="state.status === 'finished'" to="/board" class="btn btn--primary btn--sm">Новая партия</NuxtLink>

            <p v-if="notice" class="notice">{{ notice }}</p>
            <p v-if="!connected" class="notice">Связь пропала, переподключаемся…</p>
          </section>

          <section class="card card--panel">
            <ul class="players">
              <li v-for="p in players" :key="p.slot" class="player" :class="{ 'player--turn': p.slot === state.turnSlot }">
                <span class="dot" :style="{ background: p.color }" />
                <span class="player-name">{{ p.name }}<template v-if="p.slot === you"> (ты)</template></span>
                <span class="player-meta">
                  <template v-if="p.left">не играет</template>
                  <template v-else-if="!p.online">не на связи</template>
                  <template v-else-if="state.status !== 'lobby'">
                    клетка {{ (shown[p.slot] ?? p.pos) + 1 }}<template v-if="p.skills.length"> · навыков {{ p.skills.length }}</template>
                  </template>
                </span>
              </li>
            </ul>
            <button v-if="state.status !== 'finished'" class="btn btn--ghost btn--sm leave" @click="leaveTable">
              Встать из-за стола
            </button>
          </section>

          <section class="card chat">
            <div ref="chatEl" class="chat-list thin-scroll">
              <p v-if="!chat.length" class="muted chat-empty">В чате пока тихо.</p>
              <div v-for="m in chat" :key="m.id" class="msg">
                <span class="msg-name" :style="{ color: playerBySlot(m.slot)?.color }">{{ m.name }}</span>
                <span class="msg-time">{{ time(m.at) }}</span>
                <div class="msg-text">{{ m.text }}</div>
              </div>
            </div>
            <form class="chat-form" @submit.prevent="sendChat">
              <input v-model="draft" class="chat-input" :maxlength="BOARD_CHAT_MAX" placeholder="Написать за стол…" autocomplete="off">
              <button class="btn btn--primary btn--sm" type="submit" :disabled="!draft.trim()">↵</button>
            </form>
          </section>

          <section class="card card--panel">
            <ul class="log thin-scroll">
              <li v-for="e in [...state.log].reverse()" :key="e.id">{{ e.text }}</li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg-dark);
  color: var(--parchment);
}

.room {
  max-width: 1240px;
  margin: 0 auto;
  padding: 88px 20px 48px;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.top-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back {
  color: var(--ember-soft);
  text-decoration: none;
}

.code {
  font-family: var(--font-display);
  letter-spacing: .1em;
}

.note,
.muted {
  color: var(--text-muted);
}

.muted { margin: 0 0 12px; font-size: 14px; line-height: 1.5; }

.fatal p { margin: 0 0 12px; }

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 20px;
  align-items: start;
}

@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
}

/* ── Карта ─────────────────────────────── */
.map {
  position: relative;
  aspect-ratio: 16 / 11;
  border-radius: var(--radius-lg);
  background:
    radial-gradient(ellipse at 30% 20%, rgba(214, 136, 62, .12), transparent 60%),
    radial-gradient(ellipse at 80% 90%, rgba(75, 97, 73, .25), transparent 55%),
    var(--bg-dark-2);
  border: 1px solid var(--line);
  overflow: hidden;
}

.path {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.road {
  fill: none;
  stroke: rgba(241, 230, 210, .18);
  stroke-width: 3;
  stroke-dasharray: 6 6;
  vector-effect: non-scaling-stroke;
}

/* Стрелки прыжков — тонкой бледной волной: карта читается сквозь них. */
.arrow {
  fill: none;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  opacity: .5;
}

.arrow--fwd { stroke: var(--success); }
.arrow--back { stroke: var(--danger); }
.head--fwd { fill: var(--success); opacity: .6; }
.head--back { fill: var(--danger); opacity: .6; }

/* Условные обозначения под картой. */
.legend {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  font-size: 13px;
  color: var(--text-muted);
}

.legend li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-cell {
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-round);
  border: 2px solid var(--line-bold);
  background: var(--bg-dark);
  flex: none;
}

.legend-cell.cell--forward { border-color: var(--success); }
.legend-cell.cell--back { border-color: var(--danger); }
.legend-cell.cell--skip { border-color: var(--text-muted); border-style: dashed; }
.legend-cell.cell--again { border-color: var(--gold); }

.legend-cell .cell-skill {
  width: 7px;
  height: 7px;
  top: -4px;
  right: -4px;
}

.legend .legend-skinner {
  position: static;
  transform: none;
  width: 18px;
  height: 18px;
  gap: 3px;
  flex: none;
}

.legend .legend-skinner .skinner-eye {
  width: 3px;
  height: 3px;
}

.cell {
  position: absolute;
  transform: translate(-50%, -50%);
  width: clamp(24px, 4.2vw, 38px);
  height: clamp(24px, 4.2vw, 38px);
  border-radius: var(--radius-round);
  border: 2px solid var(--line-bold);
  background: var(--bg-dark);
  color: var(--parchment);
  font: 600 clamp(10px, 1.2vw, 13px) / 1 var(--font-body);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
}

.cell--forward { border-color: var(--success); }
.cell--back { border-color: var(--danger); }
.cell--skip { border-color: var(--text-muted); border-style: dashed; }
.cell--again { border-color: var(--gold); }
.cell--start { background: var(--moss); }
.cell--finish { background: var(--ember); color: var(--ink); border-color: var(--ember-soft); }
.cell--picked { box-shadow: 0 0 0 3px var(--ember-soft); }

.pawn {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: var(--radius-round);
  box-shadow: 0 0 0 3px var(--pawn), 0 3px 8px rgba(0, 0, 0, .5);
  transition: left .2s ease, top .2s ease;
  pointer-events: none;
  line-height: 0;
  z-index: 2;
}

/* По стрелке фишка летит одним прыжком — медленнее, чем шагает по клеткам. */
.pawn--jump { transition-duration: .7s; transition-timing-function: ease-in-out; }

.pawn--turn { z-index: 3; box-shadow: 0 0 0 3px var(--pawn), 0 0 14px 4px var(--pawn); }
.pawn--left { opacity: .4; }

@media (prefers-reduced-motion: reduce) {
  .pawn { transition: none; }
}

/* Клетка, что даёт навык, — с золотым ромбиком в углу. */
.cell { overflow: visible; }

.cell-skill {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 9px;
  height: 9px;
  background: var(--gold);
  transform: rotate(45deg);
  border-radius: 2px;
  box-shadow: 0 0 0 2px var(--bg-dark);
}

/* Скиннер — тёмная тень с красными глазами над клеткой, где он сейчас. */
.skinner {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 30px;
  height: 30px;
  border-radius: 45% 45% 40% 40%;
  background: radial-gradient(circle at 50% 40%, #5a1f1a, #1a0b09 75%);
  box-shadow: 0 0 0 2px #7a2a22, 0 0 16px 4px rgba(160, 40, 30, .55);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  z-index: 4;
  pointer-events: none;
  transition: left .6s ease-in-out, top .6s ease-in-out;
}

.skinner-eye {
  width: 5px;
  height: 5px;
  border-radius: var(--radius-round);
  background: #ff5a3c;
  box-shadow: 0 0 6px 2px #ff5a3c;
}

@media (prefers-reduced-motion: reduce) {
  .skinner { transition: none; }
}

.cell-info-skill {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--gold);
}

.notes {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: grid;
  gap: 4px;
  font-size: 14px;
  line-height: 1.45;
  color: var(--ember-soft);
}

.skills {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  display: grid;
  gap: 10px;
}

.skills-title {
  margin: 0;
  font-size: 12px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.skill {
  display: flex;
  align-items: center;
  gap: 10px;
}

.skill-text {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}

.skill-name {
  color: var(--gold);
  font-weight: 600;
  font-size: 14px;
}

.skill-hint {
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-muted);
}

.brawl-pick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.brawl-pick .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
}

.dice-pair {
  display: flex;
  gap: 8px;
  flex: none;
}

.cell-info {
  margin: 0 0 14px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--fill-strong);
  border-left: 3px solid var(--ember-soft);
}

.cell-info-head {
  font-size: 13px;
  color: var(--text-muted);
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.effect-chip {
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--fill-bold);
  color: var(--ember-soft);
}

.cell-info-text {
  margin: 6px 0 0;
  font-family: var(--font-display);
  font-size: 19px;
  line-height: 1.4;
}

/* ── Боковая колонка ───────────────────── */
.side {
  display: grid;
  gap: 12px;
}

.turn-title {
  font-family: var(--font-display);
  font-size: 20px;
  margin: 0 0 6px;
}

.dice-row {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 14px;
}

/* Кубик из девяти ячеек 3×3: точки зажигаются по выпавшей грани. */
.dice {
  flex: none;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: var(--parchment);
  display: grid;
  grid-template: repeat(3, 1fr) / repeat(3, 1fr);
  padding: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, .4);
}

.dice--rolling { animation: wobble .14s linear infinite; }

@keyframes wobble {
  0%, 100% { transform: rotate(-8deg); }
  50% { transform: rotate(8deg); }
}

@media (prefers-reduced-motion: reduce) {
  .dice--rolling { animation: none; }
}

.pip {
  width: 9px;
  height: 9px;
  margin: auto;
  border-radius: var(--radius-round);
  background: var(--ink);
  visibility: hidden;
}

.pip--5[data-face='1'], .pip--5[data-face='3'], .pip--5[data-face='5'],
.pip--1[data-face='2'], .pip--9[data-face='2'],
.pip--1[data-face='3'], .pip--9[data-face='3'],
.pip--1[data-face='4'], .pip--3[data-face='4'], .pip--7[data-face='4'], .pip--9[data-face='4'],
.pip--1[data-face='5'], .pip--3[data-face='5'], .pip--7[data-face='5'], .pip--9[data-face='5'],
.pip--1[data-face='6'], .pip--3[data-face='6'], .pip--4[data-face='6'],
.pip--6[data-face='6'], .pip--7[data-face='6'], .pip--9[data-face='6'] {
  visibility: visible;
}

.roll { width: 100%; }

.notice {
  margin: 10px 0 0;
  font-size: 14px;
  color: var(--ember-soft);
}

.players {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.player {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: var(--radius-md);
}

.player--turn { background: var(--fill-strong); }

.dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-round);
  flex: none;
}

.player-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.player-meta { font-size: 13px; color: var(--text-muted); }

.leave { margin-top: 12px; }

.chat {
  display: flex;
  flex-direction: column;
  height: 320px;
}

.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
}

.chat-empty { margin: 0; }

.msg { margin-bottom: 10px; }
.msg-name { font-weight: 600; font-size: 14px; }
.msg-time { font-size: 12px; color: var(--text-muted); margin-left: 6px; }
.msg-text { font-size: 15px; line-height: 1.45; overflow-wrap: anywhere; }

.chat-form {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--line);
}

.chat-input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--line-strong);
  background: var(--fill);
  color: var(--parchment);
  /* 16px — меньше iPhone приближает страницу при фокусе. */
  font: 16px var(--font-body);
}

.log {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 180px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
}

.log li + li { margin-top: 4px; }
</style>
