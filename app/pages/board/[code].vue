<script setup lang="ts">
// Импортируем явно, а не через автоимпорт: новый экспорт из shared/ попадает в
// сгенерированный список не сразу, и в шаблоне он оказывается undefined.
import {
  BOARD_CELLS,
  BOARD_CHAT_MAX,
  BOARD_LAST,
  BOARD_MAP_RATIO,
  BOARD_SKILLS,
  effectLabel,
  jumpTarget,
  type BoardAction,
  type BoardEffect,
  type BoardSkill,
} from '#shared/utils/board'
import { boardArrows } from '~/utils/boardArrows'


const route = useRoute()
const code = String(route.params.code ?? '').toUpperCase()

const { data: settings } = await useFetch('/api/settings')
const { state, chat, you, connected, fatal, notice, needName, nameError, joinAs, start, rematch, roll, choose, useSkill: playSkill, say, leave } = useBoardRoom(code)
const guestNameInput = ref('')

const players = computed(() => state.value?.players ?? [])
const me = computed(() => players.value.find(p => p.slot === you.value) ?? null)
const isHost = computed(() => state.value?.hostSlot === you.value)
/** Новую партию начинает следующий по кругу; если он пропал со связи — любой. */
const canRematch = computed(() => {
  const next = playerBySlot(state.value?.nextHostSlot)
  return !next || next.slot === you.value || !next.online
})
const playerBySlot = (slot: number | null | undefined) => players.value.find(p => p.slot === slot) ?? null
const turnPlayer = computed(() => playerBySlot(state.value?.turnSlot))
const winner = computed(() => playerBySlot(state.value?.winnerSlot))
/** Счёт стола — с первой доигранной партии, у кого больше побед, тот выше. */
const score = computed(() => state.value?.games
  ? [...players.value].sort((a, b) => b.wins - a.wins || a.slot - b.slot)
  : [])

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
/** Встреча на клетке — оба кубика с именами, чтобы было видно, кто сколько
 *  выбросил. Держится на экране до следующего хода. */
type Duel = { a: number; b: number; va: number; vb: number; rolling: boolean; low: boolean }
const duelShown = ref<Duel | null>(null)
let duelTimer: ReturnType<typeof setTimeout> | null = null
onBeforeUnmount(() => { if (duelTimer) clearTimeout(duelTimer) })
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
  duelShown.value = null
  if (duelTimer) clearTimeout(duelTimer)

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
    } else if (fx.kind === 'duel') {
      await wait(400)
      // Плашка встаёт у того края карты, что дальше от места встречи, — иначе
      // закрыла бы сами фишки.
      const where = BOARD_CELLS[shown[fx.a] ?? 0]!
      const d: Duel = { a: fx.a, b: fx.b, va: 1, vb: 1, rolling: true, low: where.y < 50 }
      duelShown.value = d
      for (let i = 0; i < 10; i++) {
        d.va = 1 + Math.floor(Math.random() * 6)
        d.vb = 1 + Math.floor(Math.random() * 6)
        duelShown.value = { ...d }
        await wait(80)
      }
      duelShown.value = { ...d, va: fx.va, vb: fx.vb, rolling: false }
      // Плашка закрывает верх карты — убираем её, когда итог прочитан.
      duelTimer = setTimeout(() => { duelShown.value = null }, 4000)
      await wait(1100)
    }
  }

  notes.value = action.notes
  animating.value = false
  syncPositions()
  // Ход принёс победу — объявляем, когда фишка дошла, а не раньше.
  if (state.value?.status === 'finished' && state.value.lastAction?.id === action.id && winner.value) {
    showWinner(winner.value.slot)
  }
}

/** Плашка с победителем поверх карты — пока не закроют или не пройдёт время. */
const winnerShown = ref<number | null>(null)
let winnerTimer: ReturnType<typeof setTimeout> | null = null
function showWinner(slot: number | null) {
  if (winnerTimer) clearTimeout(winnerTimer)
  winnerShown.value = slot
  if (slot !== null) winnerTimer = setTimeout(() => { winnerShown.value = null }, 8000)
}
onBeforeUnmount(() => { if (winnerTimer) clearTimeout(winnerTimer) })

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
  // Новая партия за тем же столом: прошлый ход больше не показываем.
  if (!action && seenAction > 0) {
    seenAction = -1
    landedCell.value = null
    landedSlot.value = null
    pickedCell.value = null
    notes.value = []
    duelShown.value = null
    diceFace2.value = null
    showWinner(null)
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
/** Выпало два кубика — ждём, на какой из них пойдёт игрок, чей ход. */
const choice = computed(() => state.value?.choice ?? null)
const canRoll = computed(() => myTurn.value && !choice.value)
const rollDice = () => { if (canRoll.value) ask(roll) }
const pickDice = (index: number) => { if (myTurn.value && choice.value) ask(() => choose(index)) }

// ── Навыки ──────────────────────────────────────────────
const canPlaySkill = computed(() => myTurn.value && !state.value?.skillUsed && !choice.value)
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
// Стрелки рисуются в координатах шириной 160 — и в пропорциях рисунка карты.
// Тогда SVG тянется без искажений, и наконечники стрелок не плющит.
const SX = 1.6
const SY = SX / BOARD_MAP_RATIO
const VIEW_H = 100 * SY

/** Стрелки прыжков в обход чужих клеток. Подбор изгиба — работа для слабого
 *  телефона заметная, поэтому считает сервер при отрисовке страницы. */
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
const chatInput = ref<HTMLInputElement | null>(null)

// Смайлы — та же панель, что в обсуждениях. Библиотеку грузим, когда смайлы
// впервые позвали; не загрузилась — закрываем пустую панель.
const showEmoji = ref(false)
let emojiLoad: Promise<unknown> | null = null
watch(showEmoji, (open) => {
  if (!open || emojiLoad) return
  emojiLoad = import('emoji-picker-element').catch(() => {
    emojiLoad = null
    showEmoji.value = false
  })
})

function onEmoji(e: any) {
  const emoji = e.detail?.emoji?.unicode ?? ''
  showEmoji.value = false
  if (!emoji) return
  const el = chatInput.value
  if (!el) { draft.value += emoji; return }
  const start = el.selectionStart ?? draft.value.length
  const end = el.selectionEnd ?? draft.value.length
  draft.value = (draft.value.slice(0, start) + emoji + draft.value.slice(end)).slice(0, BOARD_CHAT_MAX)
  nextTick(() => {
    el.selectionStart = el.selectionEnd = start + emoji.length
    el.focus()
  })
}

const onOutside = (e: MouseEvent) => {
  if (!(e.target as HTMLElement | null)?.closest?.('.emoji-wrap')) showEmoji.value = false
}
onMounted(() => document.addEventListener('click', onOutside))
onBeforeUnmount(() => document.removeEventListener('click', onOutside))
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

// Заход — в счётчик «разных людей» в админке. Шлёт ожившая страница, а не
// сервер: скрапер без JS сюда не дойдёт. Не дошло — не беда.
onMounted(() => { $fetch('/api/board/visit', { method: 'POST', body: { visitor: visitorId() } }).catch(() => {}) })

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
        <!-- Счёт на компьютере — здесь, наверху; на телефоне он над журналом. -->
        <div v-if="score.length" class="score score--top">
          <span class="score-title">Счёт · партий {{ state?.games }}</span>
          <span v-for="p in score" :key="p.slot" class="score-item">
            <span class="dot" :style="{ background: p.color }" />{{ p.name }} <b>{{ p.wins }}</b>
          </span>
        </div>
        <div class="top-right">
          <span class="code">Стол {{ code }}</span>
          <button class="btn btn--ghost btn--sm" @click="copyLink">{{ copied ? 'Ссылка скопирована' : 'Позвать по ссылке' }}</button>
        </div>
      </div>

      <section v-if="fatal" class="card card--panel fatal">
        <p>{{ fatal }}</p>
        <NuxtLink to="/board" class="btn btn--primary btn--sm">К столам</NuxtLink>
      </section>

      <section v-else-if="needName" class="card card--panel guest">
        <h1 class="guest-title display">Как тебя звать за столом?</h1>
        <p class="muted">Имя увидят другие игроки — на фишке и в чате. Можно и войти на сайт: тогда сядешь под своим.</p>
        <form class="guest-form" @submit.prevent="joinAs(guestNameInput)">
          <input v-model="guestNameInput" class="guest-input" maxlength="40" placeholder="Имя" autocomplete="nickname">
          <button class="btn btn--primary" type="submit" :disabled="!guestNameInput.trim()">Сесть за стол</button>
        </form>
        <p v-if="nameError" class="error-line">{{ nameError }}</p>
        <NuxtLink :to="`/login?next=${encodeURIComponent(`/board/${code}`)}`" class="btn btn--ghost btn--sm">Войти на сайт</NuxtLink>
      </section>

      <p v-else-if="!state" class="note">Подключаемся к таверне…</p>

      <div v-else class="layout">
        <div class="board-col">
          <div class="map" role="img" :aria-label="`Карта: ${BOARD_CELLS.length} клеток`">
            <!-- Розыгрыш встречи — поверх карты сверху: в панели справа он
                 сдвигал чат вниз. Итог остаётся строчкой у кубика и в журнале. -->
            <button
              v-if="winnerShown !== null && playerBySlot(winnerShown)"
              type="button"
              class="win"
              aria-live="assertive"
              @click="showWinner(null)"
            >
              <span class="win-title">Победа!</span>
              <span class="win-name" :style="{ color: playerBySlot(winnerShown)!.color }">
                {{ playerBySlot(winnerShown)!.name }}<template v-if="winnerShown === you"> — это ты</template>
              </span>
              <span class="win-hint">первым доходит до финиша</span>
            </button>
            <div v-if="duelShown && state.status !== 'lobby'" class="duel" :class="{ 'duel--low': duelShown.low }">
              <p class="duel-title">Встреча на клетке</p>
              <div class="duel-row">
                <div
                  v-for="side in [{ slot: duelShown.a, v: duelShown.va, rival: duelShown.vb }, { slot: duelShown.b, v: duelShown.vb, rival: duelShown.va }]"
                  :key="side.slot"
                  class="duel-side"
                  :class="{ 'duel-side--lost': !duelShown.rolling && side.v < side.rival }"
                >
                  <div class="dice dice--sm" :class="{ 'dice--rolling': duelShown.rolling }">
                    <span v-for="n in 9" :key="n" class="pip" :class="`pip--${n}`" :data-face="side.v" />
                  </div>
                  <span class="duel-name" :style="{ color: playerBySlot(side.slot)?.color }">{{ playerBySlot(side.slot)?.name }}</span>
                  <span v-if="!duelShown.rolling" class="duel-result">{{ side.v > side.rival ? 'победа' : 'отступает' }}</span>
                </div>
              </div>
            </div>
            <!-- Рисунок карты: сцены и тропа с камнями. Кружки клеток, стрелки и
                 фишки сайт кладёт поверх, по координатам камней. -->
            <img
              class="map-art"
              src="/board/map.webp"
              srcset="/board/map-900.webp 900w, /board/map.webp 1503w"
              sizes="(max-width: 900px) 100vw, 860px"
              alt=""
              width="1503"
              height="1046"
              decoding="async"
              fetchpriority="high"
            >
            <svg class="path" :viewBox="`0 0 160 ${VIEW_H}`" aria-hidden="true">
              <defs>
                <marker id="arrow-fwd" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.5" markerHeight="3.5" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" class="head head--fwd" />
                </marker>
                <marker id="arrow-back" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.5" markerHeight="3.5" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" class="head head--back" />
                </marker>
              </defs>
              <!-- У каждой стрелки свой градиент вдоль неё: бледный хвост у клетки,
                   откуда прыгают, и яркий наконечник у той, куда. -->
              <defs>
                <linearGradient
                  v-for="a in arrows"
                  :id="`arrow-grad-${a.from}`"
                  :key="a.from"
                  gradientUnits="userSpaceOnUse"
                  :x1="a.x1" :y1="a.y1" :x2="a.x2" :y2="a.y2"
                >
                  <stop offset="0" :class="a.forward ? 'grad-fwd' : 'grad-back'" stop-opacity="0.45" />
                  <stop offset="1" :class="a.forward ? 'grad-fwd' : 'grad-back'" stop-opacity="0.9" />
                </linearGradient>
              </defs>
              <path
                v-for="a in arrows"
                :key="`line-${a.from}`"
                :d="a.d"
                class="arrow"
                :stroke="`url(#arrow-grad-${a.from})`"
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
              {{ i === BOARD_LAST ? '★' : i || '' }}
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

          <!-- Журнал на компьютере — под картой: справа и так тесно. На
               телефоне он в самом низу, после чата. -->
          <section class="card card--panel log-card log-card--desk">
            <ul class="log thin-scroll">
              <li v-for="e in [...state.log].reverse()" :key="e.id">{{ e.text }}</li>
            </ul>
          </section>
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
                {{ infoCell ? `Клетка ${infoCell}` : 'Старт' }}
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

            <!-- Два кубика: игрок сам выбирает, на какой идти — больший не всегда лучше. -->
            <div v-if="state.status === 'playing' && choice" class="choice">
              <template v-if="turnPlayer?.slot === you">
                <p class="choice-title">На сколько идти?</p>
                <div class="choice-row">
                  <button
                    v-for="(v, i) in choice"
                    :key="i"
                    class="btn btn--primary choice-btn"
                    :disabled="!myTurn"
                    @click="pickDice(i)"
                  >
                    Пойти на {{ v }}
                  </button>
                </div>
              </template>
              <p v-else class="muted">{{ turnPlayer?.name }} выбирает, на сколько идти: {{ choice[0] }} или {{ choice[1] }}</p>
            </div>
            <button v-else-if="state.status === 'playing'" class="btn btn--primary roll" :disabled="!canRoll" @click="rollDice">
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
            <div v-else-if="state.status === 'finished'" class="finish-actions">
              <button v-if="canRematch" class="btn btn--primary btn--sm" :disabled="!connected" @click="rematch">
                Ещё партия за этим столом
              </button>
              <p v-else class="muted">Новую партию за этим столом начнёт {{ playerBySlot(state.nextHostSlot)?.name }}.</p>
              <NuxtLink to="/board" class="btn btn--ghost btn--sm">К столам</NuxtLink>
            </div>

            <p v-if="notice" class="notice">{{ notice }}</p>
            <p v-if="!connected" class="notice">Связь пропала, переподключаемся…</p>
          </section>

          <section class="card card--panel">
            <ul class="players">
              <li v-for="p in players" :key="p.slot" class="player" :class="{ 'player--turn': p.slot === state.turnSlot, 'player--left': p.left }">
                <span class="dot" :style="{ background: p.color }" />
                <span class="player-name">{{ p.name }}<template v-if="p.slot === you"> (ты)</template></span>
                <span class="player-meta">
                  <template v-if="p.left">не за столом</template>
                  <template v-else-if="!p.online">не на связи</template>
                  <template v-else-if="state.status !== 'lobby'">
                    {{ (shown[p.slot] ?? p.pos) ? `клетка ${shown[p.slot] ?? p.pos}` : 'на старте' }}<template v-if="p.skills.length"> · навыков {{ p.skills.length }}</template><template v-if="p.bonus"> · бросок в запасе</template>
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
              <input ref="chatInput" v-model="draft" class="chat-input" :maxlength="BOARD_CHAT_MAX" placeholder="Написать за стол…" autocomplete="off">
              <div class="emoji-wrap">
                <button class="emoji-btn" type="button" aria-label="Смайлы" @click.stop="showEmoji = !showEmoji">😊</button>
                <ClientOnly>
                  <emoji-picker v-if="showEmoji" class="dark emoji-panel" @emoji-click="onEmoji" />
                </ClientOnly>
              </div>
              <button class="btn btn--primary btn--sm" type="submit" :disabled="!draft.trim()">↵</button>
            </form>
          </section>

          <section class="card card--panel log-card log-card--phone">
            <div v-if="score.length" class="score">
              <span class="score-title">Счёт · партий {{ state.games }}</span>
              <span v-for="p in score" :key="p.slot" class="score-item">
                <span class="dot" :style="{ background: p.color }" />{{ p.name }} <b>{{ p.wins }}</b>
              </span>
            </div>
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

.guest {
  max-width: 520px;
  margin: 24px auto;
}

.guest-title {
  margin: 0 0 8px;
  font-size: 24px;
}

.guest-form {
  display: flex;
  gap: 8px;
  margin: 16px 0 8px;
}

.guest-input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--line-strong);
  background: var(--fill);
  color: var(--parchment);
  font: 16px var(--font-body);
}

.error-line { margin: 0 0 12px; color: var(--danger); font-size: 14px; }

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 20px;
  align-items: start;
}

@media (max-width: 900px) {
  /* minmax(0, …): иначе колонка не уже своего содержимого, и на узких
     телефонах (меньше 390) страница уезжает вбок. */
  .layout { grid-template-columns: minmax(0, 1fr); }
}

/* ── Карта ─────────────────────────────── */
.map {
  position: relative;
  /* Пропорции рисунка карты — те же, что BOARD_MAP_RATIO. */
  aspect-ratio: 1503 / 1046;
  border-radius: var(--radius-lg);
  background: var(--bg-dark-2);
  border: 1px solid var(--line);
  overflow: hidden;
}

.path {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.map-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  pointer-events: none;
}


/* Стрелки прыжков — тонкой бледной волной: карта читается сквозь них. */
/* Стрелки прыжков — прямые, с градиентом от бледного хвоста к наконечнику. */
.arrow {
  fill: none;
  stroke-width: 2.4;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.grad-fwd { stop-color: var(--success); }
.grad-back { stop-color: var(--danger); }
.head--fwd { fill: var(--success); opacity: .9; }
.head--back { fill: var(--danger); opacity: .9; }

.log-card--desk { margin-top: 14px; }

/* Счёт стола — строкой над журналом. */
.score {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
}
.score--top {
  flex: 1;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: 0;
}
.score-title { color: var(--text-muted); }
.score-item { display: inline-flex; align-items: center; gap: 6px; }
.score-item b { color: var(--gold); }
.log-card--phone { display: none; }

@media (max-width: 900px) {
  .log-card--desk { display: none; }
  .score--top { display: none; }
  .log-card--phone { display: block; }
}

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

.legend-cell.cell--forward { border-color: var(--success); background: var(--success-fill); }
.legend-cell.cell--back { border-color: var(--danger); background: var(--danger-fill); }
.legend-cell.cell--skip { border-color: var(--ink-soft); border-style: dashed; background: var(--parchment); }
.legend-cell.cell--again { border-color: var(--gold); background: var(--gold); }

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

/* Клетки с действием залиты целиком — их видно издалека. Номер на
   зелёной и красной — светлый, на жёлтой и белой — тёмный, иначе не читается. */
.cell--forward { border-color: var(--success); background: var(--success-fill); }
.cell--back { border-color: var(--danger); background: var(--danger-fill); }
.cell--skip { border-color: var(--ink-soft); border-style: dashed; background: var(--parchment); color: var(--ink); }
.cell--again { border-color: var(--gold); background: var(--gold); color: var(--ink); }
/* Старт — у таверны, до первой клетки: пустой кружок без номера, чтобы
   не путался с зелёными клетками «вперёд по стрелке». */
.cell--start { background: rgba(20, 14, 10, .45); border-style: dashed; }
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
/* Ушедший из-за стола: фишка остаётся, но серая — ход её пропускается. */
.pawn--left { opacity: .35; filter: grayscale(1); }

.player--left .player-name { text-decoration: line-through; color: var(--text-muted); }
.player--left .player-meta { color: var(--danger); }

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

.duel {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  min-width: 240px;
  padding: 10px 16px 12px;
  border-radius: var(--radius-md);
  background: rgba(20, 14, 10, .9);
  border: 1px solid var(--line-strong);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .45);
  pointer-events: none;
}

.duel--low { top: auto; bottom: 10px; }

/* Победитель — по центру карты, крупно; нажатие закрывает. */
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
.win-title { font-family: var(--font-display); font-size: 26px; color: var(--gold); }
.win-name { font-size: 20px; font-weight: 600; overflow-wrap: anywhere; text-align: center; }
.win-hint { font-size: 13px; color: var(--text-muted); }

@keyframes win-in {
  from { opacity: 0; transform: translate(-50%, -50%) scale(.85); }
}

@media (max-width: 600px) {
  .win { padding: 10px 16px 12px; }
  .win-title { font-size: 20px; }
  .win-name { font-size: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .win { animation: none; }
}

@media (max-width: 600px) {
  .duel { top: 6px; }
  .duel--low { top: auto; bottom: 6px; }

  .duel {
    min-width: 200px;
    padding: 8px 12px 10px;
  }

  .duel .dice.dice--sm { width: 32px; height: 32px; padding: 5px; }
  .duel .dice--sm .pip { width: 5px; height: 5px; }
}

.duel-title {
  margin: 0 0 10px;
  font-size: 12px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.duel-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.duel-side {
  display: grid;
  justify-items: center;
  gap: 6px;
  text-align: center;
  transition: opacity .3s;
}

.duel-side--lost { opacity: .55; }

.duel-name {
  font-weight: 600;
  font-size: 14px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.duel-result {
  font-size: 13px;
  color: var(--text-muted);
}

.dice.dice--sm {
  width: 40px;
  height: 40px;
  padding: 6px;
  border-radius: 9px;
}

.dice--sm .pip {
  width: 6px;
  height: 6px;
}

.finish-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.finish-actions .muted { margin: 0; flex-basis: 100%; }

.choice-title {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-size: 18px;
}

.choice-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.choice-btn { width: 100%; }

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
  /* Карточки уже своего содержимого — иначе узкий телефон уводит их вбок. */
  grid-template-columns: minmax(0, 1fr);
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

.emoji-wrap {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
}

.emoji-btn {
  padding: 2px 4px;
  border: none;
  background: none;
  font-size: 18px;
  line-height: 1;
  opacity: .55;
  cursor: pointer;
  transition: opacity .15s;
}

.emoji-btn:hover { opacity: 1; }

/* Панель раскрывается вверх: поле чата внизу карточки. */
.emoji-panel {
  position: absolute;
  right: 0;
  bottom: 36px;
  z-index: var(--z-dropdown);
  --num-columns: 8;
  --emoji-size: 1.3rem;
  --background: #1a1108;
  --border-color: rgba(241, 230, 210, .15);
  --indicator-color: var(--ember-soft, #d6883e);
  --input-border-color: rgba(241, 230, 210, .2);
  --input-font-color: #f1e6d2;
  --input-placeholder-color: rgba(241, 230, 210, .4);
  --search-icon-no-results-color: rgba(241, 230, 210, .3);
  --category-font-color: rgba(241, 230, 210, .5);
}

@media (max-width: 600px) {
  .emoji-panel {
    position: fixed;
    right: auto;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    max-width: calc(100vw - 24px);
    --num-columns: 7;
  }
}

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
