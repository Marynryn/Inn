<script setup lang="ts">
import type { ReelState, ReelSymbol, SpinResult } from '#shared/utils/reel'
import { fullReelTexts } from '#shared/utils/reel'
import { frameScale } from '#shared/utils/avatarFrames'

/**
 * Барабан: окошко, в котором крутятся символы, и то, что выпало. Что выпадет,
 * решает сервер — лента лишь доезжает до его ответа.
 *
 * С trialId это пробная прокрутка из панели: любого барабана, черновика тоже,
 * и ничего не записывается и не выдаётся.
 */
const props = defineProps<{ trialId?: number }>()
const emit = defineEmits<{ close: [] }>()

const auth = useAuthStore()
useScrollLock()

type Phase = 'loading' | 'ready' | 'spinning' | 'result' | 'error'

const phase = ref<Phase>('loading')
const state = ref<ReelState | null>(null)
const result = ref<SpinResult | null>(null)
const error = ref('')
const nearMiss = ref(false)

const symbols = computed(() => state.value?.reel?.symbols ?? [])
const title = computed(() => state.value?.reel?.title ?? '')
const t = computed(() => state.value?.reel?.texts ?? fullReelTexts(null))
const trial = computed(() => Boolean(props.trialId))
/** Сколько попыток осталось сегодня; null — без ограничений (админ, проба). */
const left = ref<number | null>(null)
const perDay = computed(() => state.value?.perDay ?? 1)

const base = computed(() => (props.trialId ? `/api/admin/reels/${props.trialId}/trial` : '/api/reel'))

// Лента: сверху то, что видно сейчас, снизу — куда она доедет.
const strip = ref<ReelSymbol[]>([])
const offset = ref(0)
const transition = ref('none')
const windowEl = ref<HTMLElement | null>(null)

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!

const load = async () => {
  try {
    state.value = await $fetch<ReelState>(base.value)
  } catch (e: any) {
    error.value = e.data?.message || 'Барабан не загрузился'
    phase.value = 'error'
    return
  }

  if (!state.value.reel || !symbols.value.length) {
    error.value = 'Барабан сейчас не крутится'
    phase.value = 'error'
    return
  }

  left.value = state.value.left
  // Попытки на сегодня кончились — например, закрыл вкладку посреди вращения.
  // Показываем, что выпало в последний раз, а не ленту, которую не запустить.
  if (state.value.today && left.value === 0) {
    result.value = state.value.today
    phase.value = 'result'
    return
  }

  strip.value = [pick(symbols.value), pick(symbols.value), pick(symbols.value)]
  phase.value = 'ready'
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const spinNow = async () => {
  if (phase.value !== 'ready') return
  phase.value = 'spinning'
  error.value = ''

  let res: SpinResult
  try {
    res = await $fetch<SpinResult>(props.trialId ? base.value : '/api/reel/spin', { method: 'POST' })
  } catch (e: any) {
    error.value = e.data?.message || 'Не получилось — попробуй ещё раз'
    phase.value = e.statusCode === 409 ? 'error' : 'ready'
    return
  }

  const target = symbols.value.find(s => s.id === res.segmentId) ?? pick(symbols.value)
  const others = symbols.value.filter(s => s.id !== target.id)
  const pool = others.length ? others : symbols.value

  // «Почти»: выпала сценка, а приз проехал на соседней клетке — над линией
  // или под ней. Не всегда, иначе это перестанет что-либо значить.
  const prizes = pool.filter(s => s.isPrize)
  nearMiss.value = !target.isPrize && prizes.length > 0 && Math.random() < 0.5
  const neighbour = nearMiss.value ? pick(prizes) : pick(pool)
  const around = Math.random() < 0.5 ? [neighbour, pick(pool)] : [pick(pool), neighbour]

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const seconds = reduce ? 0 : nearMiss.value ? 4.6 : 3.8

  const run = Array.from({ length: 26 }, () => pick(symbols.value))
  strip.value = [...strip.value.slice(-3), ...run, around[0]!, target, around[1]!]

  // Сначала без анимации ставим ленту в начало, потом едем: иначе браузер
  // склеит оба положения в одно и лента прыгнет сразу в конец.
  transition.value = 'none'
  offset.value = 0
  await nextTick()
  void windowEl.value?.offsetHeight

  const cell = windowEl.value ? parseFloat(getComputedStyle(windowEl.value).getPropertyValue('--cell')) : 116
  transition.value = `transform ${seconds}s cubic-bezier(${nearMiss.value ? '.2,.7,.1,1' : '.15,.6,.2,1'})`
  offset.value = -(strip.value.length - 3) * cell

  await wait(seconds * 1000 + 120)
  await wait(reduce ? 200 : 900)
  if (!trial.value) left.value = res.left ?? null
  result.value = res
  phase.value = 'result'
}

// ── Результат ─────────────────────────────────────
const PRIZE = 232
const prizeFace = computed(() => {
  const fit = result.value?.frame?.fit
  return fit ? Math.round(PRIZE / frameScale(fit)) : PRIZE
})

const wearing = ref(false)
const worn = ref(false)
const isWorn = computed(() => {
  if (worn.value) return true
  if (result.value?.frame) return (auth.user as any)?.avatarFrame?.id === result.value.frame.id
  if (result.value?.figure) return auth.user?.figure?.id === result.value.figure.id
  return false
})
const prize = computed(() => result.value?.frame ?? result.value?.figure ?? result.value?.skin ?? null)

// Аватарка в рамке видна сразу у повторки — эта рамка и так своя — и после
// «Надеть» у выигрыша. До того в середине пусто: рамку показываем саму по себе.
const faceShown = computed(() => result.value?.outcome === 'duplicate' || worn.value)

const wear = async () => {
  if (!prize.value || trial.value) return
  wearing.value = true
  error.value = ''
  try {
    const form = new FormData()
    if (result.value?.frame) form.append('avatarFrameId', String(result.value.frame.id))
    else if (result.value?.figure) form.append('figure', result.value.figure.id)
    else form.append('skinId', String(result.value!.skin!.id))
    await $fetch('/api/profile', { method: 'PUT', body: form })
    await auth.fetchMe()
    worn.value = true
  } catch (e: any) {
    error.value = e.data?.message || 'Не наделась — попробуй из профиля'
  } finally {
    wearing.value = false
  }
}

const eyebrow = computed(() => {
  if (trial.value) return 'Выпало бы'
  switch (result.value?.outcome) {
    case 'won': return result.value.figure ? t.value.wonFigure : result.value.skin ? t.value.wonSkin : t.value.wonFrame
    case 'duplicate': return t.value.duplicate
    default: return t.value.scene
  }
})

/** Ещё попытка: обратно к ленте, она стоит там, где остановилась. */
const canAgain = computed(() => !trial.value && (left.value === null || left.value > 0))
const again = () => {
  result.value = null
  worn.value = false
  error.value = ''
  phase.value = 'ready'
}

const close = () => {
  if (phase.value === 'spinning') return
  emit('close')
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  load()
})
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="reel-backdrop" @click.self="close">
      <div
        class="reel-sheet"
        :class="{ 'is-result': phase === 'result' }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reel-title"
      >
        <button v-if="phase !== 'spinning'" class="reel-close" type="button" aria-label="Закрыть" @click="close">×</button>
        <span v-if="trial" class="trial-tag">Пробная прокрутка</span>

        <!-- Лента -->
        <template v-if="phase === 'loading' || phase === 'ready' || phase === 'spinning'">
          <h2 id="reel-title" class="display reel-title">«{{ title || 'Барабан' }}»</h2>
          <p class="reel-lead">
            <template v-if="trial">Видишь только ты. Ничего не выдаётся и не записывается.</template>
            <template v-else>{{ t.lead }}</template>
          </p>

          <div ref="windowEl" class="reel-window">
            <div
              class="reel-strip"
              :style="{ transform: `translateY(${offset}px)`, transition }"
            >
              <div v-for="(s, i) in strip" :key="i" class="reel-cell">
                <img :src="s.url" alt="" draggable="false">
              </div>
            </div>
            <span class="reel-line" aria-hidden="true" />
          </div>

          <p class="reel-err" aria-live="polite">{{ error }}</p>

          <button class="reel-btn" type="button" :disabled="phase !== 'ready'" @click="spinNow">
            {{ phase === 'spinning' ? 'Крутится…' : phase === 'loading' ? 'Смотрим…' : t.spinButton }}
          </button>
        </template>

        <!-- Не вышло -->
        <template v-else-if="phase === 'error'">
          <h2 id="reel-title" class="display reel-title">Барабан</h2>
          <p class="reel-lead">{{ error }}</p>
          <button class="reel-btn ghost" type="button" @click="close">Закрыть</button>
        </template>

        <!-- Что выпало -->
        <template v-else-if="result">
          <div class="rays-clip" aria-hidden="true"><div class="rays" /></div>
          <p class="eyebrow">{{ eyebrow }}</p>

          <div
            v-if="result.frame"
            class="prize"
            :class="{ 'face-shown': faceShown }"
            :style="{ '--prize': `${PRIZE}px`, '--face': `${prizeFace}px` }"
          >
            <span class="prize-hole" aria-hidden="true" />
            <UserAvatar
              class="prize-face"
              :src="auth.user?.avatarUrl"
              :name="auth.name"
              :frame="null"
              :size="prizeFace"
              alt=""
            />
            <img class="prize-frame" :src="result.frame.url" alt="" draggable="false">
          </div>
          <div v-else-if="result.figure" class="prize-figure">
            <img :src="result.figure.big" alt="" draggable="false">
            <span class="figure-by-name">
              {{ auth.name }}<NameFigure :figure="result.figure" />
            </span>
          </div>
          <div
            v-else-if="result.skin"
            class="prize-skin"
            :style="{ background: result.skin.tint, '--accent': result.skin.accent }"
          >
            <img class="corner" :src="result.skin.url" alt="" draggable="false">
            <img class="corner corner--right" :src="result.skin.url" alt="" draggable="false">
            <span class="skin-name">{{ auth.name }}</span>
            <span class="skin-line" />
            <span class="skin-line skin-line--short" />
          </div>
          <img v-else class="scene-pic" :src="result.imageUrl" alt="" draggable="false">

          <h2 id="reel-title" class="display prize-name">{{ result.label }}</h2>

          <p class="prize-sub">
            <template v-if="result.outcome === 'won' && !trial && result.figure">{{ t.wonFigureSub }}</template>
            <template v-else-if="result.outcome === 'won' && !trial && result.skin">{{ t.wonSkinSub }}</template>
            <template v-else-if="result.outcome === 'won' && !trial">{{ t.wonFrameSub }}</template>
            <template v-else-if="result.outcome === 'duplicate' && result.skin">{{ t.duplicateSkinSub }}</template>
            <template v-else-if="result.outcome === 'duplicate' && result.figure">{{ t.duplicateFigureSub }}</template>
            <template v-else-if="result.outcome === 'duplicate'">{{ t.duplicateFrameSub }}</template>
            <template v-else-if="result.text">{{ result.text }}</template>
          </p>

          <div class="actions">
            <button
              v-if="prize && !trial && !isWorn"
              class="reel-btn"
              type="button"
              :disabled="wearing"
              @click="wear"
            >
              {{ wearing ? 'Надеваем…' : t.wearButton }}
            </button>
            <span v-else-if="prize && !trial" class="worn-tag">✓ Надета</span>
            <button v-if="canAgain" class="reel-btn" :class="{ ghost: prize && !isWorn }" type="button" @click="again">
              {{ t.againButton }}<template v-if="left !== null"> · {{ left }}</template>
            </button>
            <button class="reel-btn ghost" type="button" @click="close">Закрыть</button>
          </div>

          <p v-if="error" class="reel-err">{{ error }}</p>
          <p v-if="!trial && left === 0" class="reel-fine">{{ t.footer }}</p>
          <p v-else-if="!trial && left !== null && perDay > 1" class="reel-fine">Осталось попыток сегодня: {{ left }} из {{ perDay }}</p>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.reel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(15, 11, 8, .82);
  backdrop-filter: blur(3px);
}

.reel-sheet {
  position: relative;
  width: min(440px, 100%);
  max-height: calc(100dvh - 32px);
  overflow: auto;
  padding: 28px 22px 24px;
  border-radius: 14px;
  border: 1px solid rgba(241, 230, 210, .18);
  background: var(--bg-dark-2);
  color: var(--parchment);
  text-align: center;
  box-shadow: 0 30px 80px rgba(0, 0, 0, .6);
}

.reel-sheet.is-result {
  overflow: hidden auto;
}

/* Лучи шире окна и крутятся: прямо в окне их углы раздували бы прокрутку.
   Обёртка размером с окно обрезает их по краю. */
.rays-clip {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}

.reel-close {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: none;
  color: rgba(241, 230, 210, .6);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.reel-close:hover {
  background: rgba(241, 230, 210, .07);
  color: var(--parchment);
}

.trial-tag {
  display: inline-block;
  margin-bottom: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--gold);
  color: var(--bg-dark);
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.reel-title {
  margin: 0 0 4px;
  font-size: 25px;
  font-weight: 600;
  text-wrap: balance;
}

.reel-lead {
  max-width: 34ch;
  margin: 0 auto 18px;
  font-size: 13px;
  color: rgba(241, 230, 210, .62);
}

/* ── Окошко ─────────────────────────────────── */
/* Три клетки в высоту: выпавшая посередине, соседи сверху и снизу. Края
   уходят в фон окна, чтобы взгляд держался на линии. */
.reel-window {
  --cell: 116px;
  position: relative;
  width: min(240px, 100%);
  height: calc(var(--cell) * 3);
  margin: 0 auto;
  overflow: hidden;
  border-radius: 14px;
  background: var(--bg-dark);
  box-shadow: inset 0 0 0 1px rgba(241, 230, 210, .22), inset 0 8px 18px rgba(0, 0, 0, .45);
}

.reel-window::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, var(--bg-dark-2), transparent 32%, transparent 68%, var(--bg-dark-2));
}

.reel-strip {
  will-change: transform;
}

.reel-cell {
  display: grid;
  place-items: center;
  height: var(--cell);
}

.reel-cell img {
  width: calc(var(--cell) - 16px);
  height: calc(var(--cell) - 16px);
  object-fit: contain;
  user-select: none;
}

.reel-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  z-index: 1;
  height: var(--cell);
  transform: translateY(-50%);
  border-top: 2px solid rgba(232, 176, 122, .55);
  border-bottom: 2px solid rgba(232, 176, 122, .55);
  pointer-events: none;
}

.reel-err {
  min-height: 20px;
  margin: 10px 0;
  font-size: 13px;
  color: #e07070;
}

.reel-btn {
  padding: 11px 28px;
  border: none;
  border-radius: 6px;
  background: var(--ember);
  color: var(--bg-dark);
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}

.reel-btn:hover:not(:disabled) { background: var(--ember-soft); }
.reel-btn:disabled { opacity: .5; cursor: default; }

.reel-btn.ghost {
  border: 1px solid rgba(241, 230, 210, .22);
  background: none;
  color: var(--parchment);
}

.reel-btn.ghost:hover { background: rgba(241, 230, 210, .06); }

/* ── Результат ──────────────────────────────── */
.rays {
  position: absolute;
  left: 50%;
  top: 160px;
  width: 560px;
  height: 560px;
  margin: -280px 0 0 -280px;
  pointer-events: none;
  background: repeating-conic-gradient(from 0deg, rgba(232, 176, 122, .13) 0 8deg, transparent 8deg 22deg);
  -webkit-mask: radial-gradient(circle, #000 18%, transparent 62%);
  mask: radial-gradient(circle, #000 18%, transparent 62%);
  animation: rays 24s linear infinite;
}

@keyframes rays { to { transform: rotate(360deg); } }

.is-result > *:not(.rays-clip):not(.reel-close) {
  position: relative;
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--ember-soft);
}

.prize {
  width: var(--prize);
  height: var(--prize);
  max-width: 100%;
  margin: 6px auto 12px;
}

.prize-hole,
.prize-face {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--face);
  height: var(--face);
  border-radius: 50%;
}

.prize-hole {
  transform: translate(-50%, -50%);
  border: 1.5px dashed rgba(241, 230, 210, .22);
  background: radial-gradient(circle, rgba(232, 176, 122, .12), transparent 70%);
}

/* Аватарка въезжает в середину рамки, когда её надели. */
.prize-face {
  transform: translate(-50%, -50%) scale(.2);
  opacity: 0;
  background: linear-gradient(135deg, var(--ember-soft), var(--moss));
  color: var(--bg-dark);
  transition: transform .8s cubic-bezier(.2, .9, .25, 1.2), opacity .4s;
}

.prize.face-shown .prize-face {
  transform: translate(-50%, -50%) scale(1);
  opacity: 1;
}

.prize-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  animation: rise .9s cubic-bezier(.2, .9, .25, 1.25) both;
  user-select: none;
}

/* Скин — маленькая страница: его фон, углы и имя читателя цветом скина. */
.prize-skin {
  position: relative;
  width: 220px;
  height: 140px;
  margin: 10px auto 12px;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 8px;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgba(241, 230, 210, .14);
  animation: rise .8s cubic-bezier(.2, .9, .25, 1.25) both;
}

.prize-skin .corner {
  position: absolute;
  left: 0;
  top: 0;
  width: 84px;
  height: 84px;
  object-fit: contain;
  object-position: left top;
}

.prize-skin .corner--right {
  left: auto;
  right: 0;
  transform: scaleX(-1);
}

.skin-name {
  position: relative;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 700;
  color: var(--accent);
}

.skin-line {
  width: 110px;
  height: 6px;
  border-radius: 3px;
  background: rgba(241, 230, 210, .14);
}

.skin-line--short { width: 70px; }

/* Фигурка крупно, а под ней — как она встанет у имени. */
.prize-figure {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 10px;
  margin: 8px auto 6px;
  animation: rise .8s cubic-bezier(.2, .9, .25, 1.25) both;
}

.prize-figure > img {
  width: 160px;
  height: 160px;
  object-fit: contain;
}

.figure-by-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--parchment);
}

.scene-pic {
  display: block;
  width: 160px;
  height: 160px;
  margin: 8px auto 10px;
  object-fit: contain;
  animation: rise .8s cubic-bezier(.2, .9, .25, 1.25) both;
}

@keyframes rise {
  from { transform: scale(.4) rotate(-25deg); opacity: 0; }
  to { transform: none; opacity: 1; }
}

.prize-name {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  text-wrap: balance;
}

.prize-sub {
  max-width: 34ch;
  margin: 6px auto 20px;
  font-size: 13.5px;
  line-height: 1.55;
  color: rgba(241, 230, 210, .7);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 10px;
}

.worn-tag {
  padding: 10px 6px;
  font-size: 14px;
  font-weight: 500;
  color: #8fb07a;
}

.reel-fine {
  margin: 16px 0 0;
  font-size: 12px;
  color: rgba(241, 230, 210, .4);
}

@media (max-width: 480px) {
  .reel-window { --cell: 96px; }
}

@media (prefers-reduced-motion: reduce) {
  .rays,
  .prize-frame,
  .prize-figure,
  .prize-skin,
  .scene-pic { animation: none; }
  .prize-face { transition: none; }
}
</style>
