<script setup lang="ts">
import type { GameGuessRow, GameMode, GameStatus } from '#shared/utils/gameColumns'

type Pool = 'known' | 'all'

type AnswerCard = {
  id: string
  name: string
  original: string
  image: string
  row: GameGuessRow
}

type State = {
  mode: GameMode
  pool: Pool
  status: GameStatus
  day: string
  guesses: GameGuessRow[]
  poolSize: number
  answer: AnswerCard | null
  nextDailyAt: string | null
  daily: { played: number; won: number; averageGuesses: number } | null
}

type NameEntry = { id: string; name: string; original: string }

const { data: settings } = await useFetch('/api/settings')

const mode = ref<GameMode>('daily')
const state = ref<State | null>(null)
const names = ref<NameEntry[]>([])
const loading = ref(true)
const sending = ref(false)
const error = ref('')

const query = ref('')
const highlighted = ref(0)
const open = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)

const pool = computed<Pool>(() => state.value?.pool ?? 'known')

/** Сдавшемуся дописываем сверху строку загаданного — чтобы видеть, где промахнулся. */
const boardRows = computed(() => {
  if (!state.value) return []
  const rows = state.value.guesses
  return state.value.status === 'revealed' && state.value.answer
    ? [state.value.answer.row, ...rows]
    : rows
})
const finished = computed(() => state.value ? state.value.status !== 'playing' : false)
const guessedIds = computed(() => new Set(state.value?.guesses.map(g => g.id) ?? []))

// ── Загрузка ───────────────────────────────────────────────
const loadNames = async (forPool: Pool) => {
  const res = await $fetch<{ pool: Pool; characters: NameEntry[] }>('/api/game/names', {
    query: { pool: forPool },
  })
  names.value = res.characters
}

const applyState = async (next: State) => {
  state.value = next
  if (names.value.length === 0 || next.poolSize !== names.value.length) {
    await loadNames(next.pool)
  }
}

const loadState = async (nextMode: GameMode) => {
  loading.value = true
  error.value = ''
  try {
    await applyState(await $fetch<State>('/api/game/state', { query: { mode: nextMode } }))
  } catch {
    error.value = 'Не получилось открыть игру. Обнови страницу.'
  } finally {
    loading.value = false
  }
}

onMounted(() => loadState(mode.value))

const switchMode = async (next: GameMode) => {
  if (mode.value === next) return
  mode.value = next
  query.value = ''
  await loadState(next)
}

// ── Подсказки ──────────────────────────────────────────────
const normalize = (v: string) => v.toLowerCase().replace(/ё/g, 'е').trim()

const suggestions = computed(() => {
  const q = normalize(query.value)
  if (!q) return []

  const found: NameEntry[] = []
  const loose: NameEntry[] = []

  for (const entry of names.value) {
    if (guessedIds.value.has(entry.id)) continue

    const name = normalize(entry.name)
    const original = normalize(entry.original)

    if (name.startsWith(q) || original.startsWith(q)) found.push(entry)
    else if (name.includes(q) || original.includes(q)) loose.push(entry)

    if (found.length >= 8) break
  }

  return [...found, ...loose].slice(0, 8)
})

watch(suggestions, () => { highlighted.value = 0 })

const onInput = () => {
  open.value = true
}

const onKeydown = (e: KeyboardEvent) => {
  if (!suggestions.value.length) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlighted.value = (highlighted.value + 1) % suggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlighted.value = (highlighted.value - 1 + suggestions.value.length) % suggestions.value.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const picked = suggestions.value[highlighted.value]
    if (picked) guess(picked)
  } else if (e.key === 'Escape') {
    open.value = false
  }
}

// ── Ход игры ───────────────────────────────────────────────
const guess = async (entry: NameEntry) => {
  if (sending.value || finished.value) return

  sending.value = true
  error.value = ''
  try {
    const res = await $fetch<{
      row: GameGuessRow
      status: GameStatus
      answer: AnswerCard | null
      daily: State['daily']
    }>('/api/game/guess', {
      method: 'POST',
      body: { mode: mode.value, id: entry.id },
    })

    if (state.value) {
      state.value.guesses = [res.row, ...state.value.guesses]
      state.value.status = res.status
      state.value.answer = res.answer
      state.value.daily = res.daily
    }

    query.value = ''
    open.value = false
    if (res.status === 'playing') nextTick(() => inputEl.value?.focus())
  } catch (e: any) {
    error.value = e?.data?.message || 'Попытка не засчиталась. Попробуй ещё раз.'
  } finally {
    sending.value = false
  }
}

const newGame = async (nextPool: Pool = pool.value) => {
  sending.value = true
  error.value = ''
  try {
    await applyState(await $fetch<State>('/api/game/new', { method: 'POST', body: { pool: nextPool } }))
    query.value = ''
  } catch {
    error.value = 'Не получилось начать новую партию.'
  } finally {
    sending.value = false
  }
}

const giveUp = async () => {
  sending.value = true
  try {
    await applyState(await $fetch<State>('/api/game/giveup', { method: 'POST', body: { mode: mode.value } }))
  } catch {
    error.value = 'Не получилось открыть ответ.'
  } finally {
    sending.value = false
  }
}

const switchPool = (next: Pool) => {
  if (next === pool.value) return
  newGame(next)
}

// ── Часы до нового персонажа дня ───────────────────────────
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

onMounted(() => { ticker = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => { if (ticker) clearInterval(ticker) })

const msLeft = computed(() =>
  state.value?.nextDailyAt ? Date.parse(state.value.nextDailyAt) - now.value : null,
)

// Полночь наступила прямо на открытой странице — забираем нового персонажа.
let rollingOver = false
watch(msLeft, (left) => {
  if (left === null || left > 0 || rollingOver || mode.value !== 'daily') return
  rollingOver = true
  loadState('daily').finally(() => { rollingOver = false })
})

const countdown = computed(() => {
  const left = msLeft.value
  if (left === null) return ''
  if (left <= 0) return 'вот-вот'

  const h = Math.floor(left / 3_600_000)
  const m = Math.floor((left % 3_600_000) / 60_000)
  const s = Math.floor((left % 60_000) / 1000)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

// ── Поделиться результатом ─────────────────────────────────
const siteUrl = useRuntimeConfig().public.siteUrl
const MARKS = { hit: '🟩', partial: '🟨', miss: '⬜' } as const
const copied = ref(false)

const shareText = computed(() => {
  if (!state.value?.guesses.length) return ''

  const grid = [...state.value.guesses]
    .reverse()
    .map(row => GAME_COLUMNS.map(c => MARKS[row.cells[c.key].verdict]).join(''))
    .join('\n')

  const head = state.value.mode === 'daily'
    ? `Кто из таверны — персонаж дня ${state.value.day.split('-').reverse().join('.')}`
    : 'Кто из таверны — свободная игра'

  const result = state.value.status === 'won'
    ? `Угадал(а) за ${state.value.guesses.length} ${plural(state.value.guesses.length)}`
    : 'Сдался(лась)'

  return `${head}\n${result}\n\n${grid}\n\n${siteUrl}/game`
})

const share = async () => {
  try {
    await navigator.clipboard.writeText(shareText.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    error.value = 'Браузер не дал скопировать. Выдели текст руками.'
  }
}

function plural(n: number) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'попытку'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'попытки'
  return 'попыток'
}


useHead({
  title: 'Кто из таверны — игра по The Wandering Inn',
  // Игра на обкатке: ссылки на неё есть только в админке, поисковикам её не показываем.
  // Когда откроем для всех — снять noindex, вернуть ссылку в шапку и строку в sitemap.
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <div class="page">
    <AppHeader
      show-nav-links
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />

    <main class="game">
      <header class="intro">
        <div class="eyebrow">Игра · The Wandering Inn</div>
        <h1 class="title display">Кто из таверны?</h1>
        <p class="lead">
          Называй персонажей — таверна подскажет, что совпало. Зелёное совпало целиком,
          жёлтое частично, стрелка у тома говорит, в какую сторону искать.
        </p>
      </header>

      <div class="modes">
        <button class="mode" :class="{ active: mode === 'daily' }" @click="switchMode('daily')">
          Персонаж дня
        </button>
        <button class="mode" :class="{ active: mode === 'endless' }" @click="switchMode('endless')">
          Свободная игра
        </button>
      </div>

      <p v-if="loading" class="note">В таверне тасуют карточки…</p>

      <template v-else-if="state">
        <div class="bar">
          <div class="bar-left">
            <span class="chip">Попыток: {{ state.guesses.length }}</span>
            <span class="chip">Персонажей в наборе: {{ state.poolSize }}</span>
            <span v-if="mode === 'daily' && state.daily?.won" class="chip">
              Сегодня угадали: {{ state.daily.won }}
              <template v-if="state.daily.averageGuesses">
                · в среднем за {{ state.daily.averageGuesses }}
              </template>
            </span>
            <span v-if="mode === 'daily' && countdown" class="chip">Новый персонаж через {{ countdown }}</span>
          </div>

          <div v-if="mode === 'endless'" class="bar-right">
            <div class="pools">
              <button class="pool" :class="{ active: pool === 'known' }" @click="switchPool('known')">Известные</button>
              <button class="pool" :class="{ active: pool === 'all' }" @click="switchPool('all')">Все</button>
            </div>
            <button class="btn btn-ghost" :disabled="sending" @click="newGame()">Другой персонаж</button>
          </div>
        </div>

        <!-- Ввод -->
        <div v-if="!finished" class="search" @keydown="onKeydown">
          <input
            ref="inputEl"
            v-model="query"
            class="search-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :disabled="sending"
            placeholder="Имя персонажа…"
            @input="onInput"
            @focus="open = true"
            @blur="open = false"
          >
          <ul v-if="open && suggestions.length" class="suggest">
            <li
              v-for="(entry, i) in suggestions"
              :key="entry.id"
              class="suggest-item"
              :class="{ on: i === highlighted }"
              @mouseenter="highlighted = i"
              @mousedown.prevent="guess(entry)"
            >
              <span>{{ entry.name }}</span>
              <span v-if="entry.original !== entry.name" class="suggest-orig">{{ entry.original }}</span>
            </li>
          </ul>
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <!-- Итог -->
        <div v-if="finished && state.answer" class="result" :class="{ won: state.status === 'won' }">
          <!-- Картинки лежат на вики оригинала, поэтому обычный img: гонять их
               через оптимизатор картинок сайта незачем. -->
          <img
            v-if="state.answer.image"
            :src="state.answer.image"
            class="result-art"
            width="96"
            height="96"
            loading="lazy"
            referrerpolicy="no-referrer"
            alt=""
          >
          <div class="result-text">
            <div class="result-head display">
              {{ state.status === 'won' ? 'Угадано!' : 'Это был' }} {{ state.answer.name }}
            </div>
            <div v-if="state.answer.original !== state.answer.name" class="result-orig">{{ state.answer.original }}</div>
            <div class="result-sub">
              <template v-if="state.status === 'won'">
                {{ state.guesses.length }} {{ plural(state.guesses.length) }}.
              </template>
              <template v-if="mode === 'daily'">Следующий персонаж через {{ countdown }}.</template>
              <template v-else>Можно взять другого — кнопка выше.</template>
            </div>
            <div class="result-actions">
              <button class="btn btn-primary" @click="share">
                {{ copied ? 'Скопировано' : 'Поделиться результатом' }}
              </button>
              <button v-if="mode === 'endless'" class="btn btn-ghost" :disabled="sending" @click="newGame()">
                Ещё раз
              </button>
            </div>
          </div>
        </div>

        <!-- Таблица попыток -->
        <div v-if="boardRows.length" class="board-wrap">
          <div class="board" :style="{ '--cols': GAME_COLUMNS.length }">
            <div class="row head">
              <div class="cell name">Персонаж</div>
              <div v-for="col in GAME_COLUMNS" :key="col.key" class="cell">{{ col.label }}</div>
            </div>

            <div
              v-for="row in boardRows"
              :key="row.id"
              class="row"
              :class="{ hit: row.correct }"
            >
              <div class="cell name">
                <img
                  v-if="row.image"
                  :src="row.image"
                  class="avatar"
                  width="34"
                  height="34"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  alt=""
                >
                <span>{{ row.name }}</span>
              </div>
              <div
                v-for="col in GAME_COLUMNS"
                :key="col.key"
                class="cell mark"
                :class="[row.cells[col.key].verdict, { 'cell--inline': col.key === 'volume' }]"
              >
                <span v-if="!row.cells[col.key].values.length">—</span>
                <span v-for="v in row.cells[col.key].values" :key="v">{{ v }}</span>
                <span v-if="row.cells[col.key].hint" class="arrow">
                  {{ row.cells[col.key].hint === 'up' ? '↑' : '↓' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <p v-else-if="!finished" class="note">
          Первая попытка — любая: даже мимо она отсечёт половину таверны.
        </p>

        <div class="legend">
          <span><i class="sw hit" /> совпало полностью</span>
          <span><i class="sw partial" /> совпало частично</span>
          <span><i class="sw miss" /> мимо</span>
          <span><i class="sw miss">↑</i> том загаданного больше</span>
          <button v-if="!finished && state.guesses.length >= 5" class="giveup" @click="giveUp">Сдаться</button>
        </div>
      </template>
    </main>

    <AppFooter :settings="settings as any" />
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

.game {
  flex: 1;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 96px 20px 64px;
}

/* ── Шапка страницы ─────────────────────────── */
.intro {
  margin-bottom: 28px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ember-soft);
  margin-bottom: 12px;
}

.title {
  font-size: 38px;
  font-weight: 600;
  margin: 0 0 12px;
}

.lead {
  margin: 0;
  max-width: 640px;
  font-size: 15px;
  line-height: 1.65;
  color: var(--text-muted);
}

/* ── Режимы ─────────────────────────────────── */
.modes {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.mode {
  font-family: var(--font-body);
  font-size: 14px;
  padding: 10px 18px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(241, 230, 210, .18);
  background: transparent;
  color: var(--parchment-2);
  cursor: pointer;
  transition: border-color .15s, color .15s, background .15s;
}

.mode:hover {
  border-color: var(--ember-soft);
  color: var(--ember-soft);
}

.mode.active {
  background: var(--ember);
  border-color: var(--ember);
  color: var(--bg-dark);
  font-weight: 500;
}

/* ── Строка состояния ───────────────────────── */
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.bar-left,
.bar-right {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.chip {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .08);
  color: var(--text-muted);
}

.pools {
  display: flex;
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.pool {
  font-family: var(--font-body);
  font-size: 12px;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.pool.active {
  background: rgba(214, 136, 62, .18);
  color: var(--ember-soft);
}

.btn {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  padding: 9px 16px;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  transition: transform .15s, box-shadow .15s, border-color .15s, color .15s;
}

.btn:disabled {
  opacity: .5;
  cursor: default;
}

.btn-primary {
  background: var(--ember);
  color: var(--bg-dark);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px -6px rgba(214, 136, 62, .6);
}

.btn-ghost {
  border: 1px solid rgba(241, 230, 210, .25);
  color: var(--parchment-2);
  background: transparent;
}

.btn-ghost:hover:not(:disabled) {
  border-color: var(--ember-soft);
  color: var(--ember-soft);
}

/* ── Поиск ──────────────────────────────────── */
.search {
  position: relative;
  max-width: 420px;
  margin-bottom: 18px;
}

.search-input {
  width: 100%;
  font-family: var(--font-body);
  font-size: 15px;
  padding: 13px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(241, 230, 210, .2);
  background: var(--bg-dark-2);
  color: var(--parchment);
  outline: none;
}

.search-input:focus {
  border-color: var(--ember);
}

.search-input::placeholder {
  color: rgba(241, 230, 210, .4);
}

.suggest {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .16);
  border-radius: var(--radius-sm);
  box-shadow: 0 18px 40px -20px rgba(0, 0, 0, .9);
}

.suggest-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  cursor: pointer;
}

.suggest-item.on {
  background: rgba(214, 136, 62, .18);
  color: var(--ember-soft);
}

.suggest-orig {
  font-size: 12px;
  color: var(--text-muted);
}

/* ── Итог ───────────────────────────────────── */
.result {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 18px;
  margin-bottom: 22px;
  border-radius: var(--radius-md);
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .12);
}

.result.won {
  border-color: rgba(214, 136, 62, .5);
  box-shadow: 0 0 40px -18px rgba(214, 136, 62, .8);
}

.result-art {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  flex: none;
}

.result-head {
  font-size: 22px;
  font-weight: 600;
}

.result-orig {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 2px;
}

.result-sub {
  font-size: 13px;
  color: var(--text-muted);
  margin: 8px 0 14px;
}

.result-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* ── Таблица ────────────────────────────────── */
.board-wrap {
  overflow-x: auto;
  padding-bottom: 6px;
}

.board {
  min-width: 860px;
}

.row {
  display: grid;
  grid-template-columns: 190px repeat(var(--cols), 1fr);
  gap: 6px;
  margin-bottom: 6px;
}

.row.head .cell {
  background: transparent;
  border: none;
  font-size: 11px;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--text-muted);
  min-height: 0;
  padding: 0 6px 2px;
}

.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 62px;
  padding: 8px 6px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.25;
  text-align: center;
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .08);
}

.cell.name {
  flex-direction: row;
  justify-content: flex-start;
  gap: 10px;
  text-align: left;
  font-size: 14px;
  font-weight: 500;
  padding-left: 10px;
}

.row.hit .cell.name {
  border-color: rgba(214, 136, 62, .6);
  color: var(--ember-soft);
}

.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
}

.mark.hit {
  background: #4b7145;
  border-color: #5c8a55;
  color: #f4ecdc;
}

.mark.partial {
  background: #a9821f;
  border-color: #c9a02e;
  color: #241c08;
}

.mark.miss {
  background: #3a2f27;
  border-color: rgba(241, 230, 210, .08);
  color: var(--text-muted);
}

/* Том — одно число, стрелка идёт рядом с ним, а не под ним. */
.cell--inline {
  flex-direction: row;
  gap: 4px;
}

.arrow {
  font-size: 16px;
  line-height: 1;
}

/* ── Мелочи ─────────────────────────────────── */
.note {
  font-size: 14px;
  color: var(--text-muted);
  margin: 8px 0 18px;
}

.error {
  font-size: 13px;
  color: #e08b6f;
  margin: 0 0 14px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  margin-top: 20px;
  font-size: 12px;
  color: var(--text-muted);
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sw {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  font-style: normal;
  font-size: 11px;
}

.sw.hit { background: #4b7145; }
.sw.partial { background: #a9821f; }
.sw.miss { background: #3a2f27; color: var(--text-muted); }

.giveup {
  margin-left: auto;
  font-family: var(--font-body);
  font-size: 12px;
  background: none;
  border: none;
  color: var(--text-muted);
  text-decoration: underline;
  cursor: pointer;
}

.giveup:hover {
  color: var(--ember-soft);
}

@media (max-width: 720px) {
  .game {
    padding: 84px 14px 48px;
  }

  .title {
    font-size: 30px;
  }

  .board {
    min-width: 760px;
  }

  .row {
    grid-template-columns: 150px repeat(var(--cols), 1fr);
  }

  .result {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
