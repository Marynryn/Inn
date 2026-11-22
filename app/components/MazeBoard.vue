<script setup lang="ts">
import type {
  Maze,
  MazeCell,
  MazeDir,
  MazeMoveResult,
  MazeRunView,
} from "#shared/utils/maze";
import {
  DIR_DX,
  DIR_DY,
  MAZE_LIGHT,
  MAZE_MOVES_PER_REQUEST,
  cellsAround,
  cellsNear,
  corridorNext,
  formatMazeTime,
  isOpen,
  neighbor,
  walk,
} from "#shared/utils/maze";
import snowflakeUrl from "~/assets/winter/snowflake.svg";
import type { Burst } from "~/utils/mazeWinter";
import {
  drawBurst,
  drawDrifts,
  drawFrostSparks,
  drawGround,
  drawInnWindow,
  drawLantern,
  drawNight,
  drawSnow,
  drawToken,
  makeBurst,
  makeSnow,
  stepSnow,
} from "~/utils/mazeWinter";

/**
 * Поле лабиринта. Целиком лабиринт знает только сервер: здесь — клетки, которые
 * он уже открыл. Фишка идёт сразу, не дожидаясь ответа, а ходы уходят на
 * сервер пачками в фоне; в ответ приходят клетки дальше по дороге. Если ответ
 * запоздал и следующей клетки ещё нет, фишка ждёт её на месте.
 *
 * Видно то, что вокруг пройденного, на радиус фонаря. Открытое сервером чуть
 * дальше фонаря не рисуется: оно нужно, чтобы не ждать сети на каждом шаге.
 *
 * Оформление — «ночная метель» (utils/mazeWinter): идёшь с фонарём сквозь
 * снег к окошку таверны. На финише прилетает Айволет.
 */
const props = defineProps<{ run: MazeRunView }>();
const emit = defineEmits<{ finished: [ms: number]; resync: [] }>();

/** Сколько фишка идёт одну клетку. Время забега идёт и пока она едет — у
 *  всех одинаково, и от частоты кадров не зависит. */
const STEP_MS = 55;
const BUMP_MS = 140;
const SWIPE_PX = 22;

const n = props.run.size;
const exit = props.run.exit;
const bits = new Array<number>(n * n).fill(0);
const known = new Uint8Array(n * n);
// Пол видимых клеток рисуется одним контуром; он пересобирается, когда
// клеток стало больше — и видимых, и пришедших с сервера. Снег со следами —
// отдельным слоем, его пересобирает и каждый шаг.
let seenDirty = true;
let groundDirty = true;
const merge = (cells: MazeCell[]) => {
  for (const [i, b] of cells) {
    bits[i] = b;
    known[i] = 1;
  }
  if (cells.length) seenDirty = true;
};
merge(props.run.cells);

const asMaze: Maze = { size: n, cells: bits, start: props.run.start, exit };
const replay = walk(asMaze, props.run.moves);
const path = replay.path;
let pos = path.at(-1)!;
let moves = props.run.moves;
let acked = moves.length;

const seen = cellsAround(n, path, MAZE_LIGHT);

let anim: { from: number; to: number; dir: MazeDir; t0: number } | null = null;
let bump: { dir: MazeDir; t0: number } | null = null;
let queued: MazeDir | null = null;
let waiting: MazeDir | null = null;

const reachedExit = ref(props.run.finishedMs !== null || pos === exit);
const serverMs = ref<number | null>(props.run.finishedMs);
const offline = ref(false);
const startPerf = performance.now() - props.run.elapsedMs;
let localDoneMs: number | null =
  props.run.finishedMs ?? (reachedExit.value ? props.run.elapsedMs : null);
const timeText = ref(
  props.run.finishedMs !== null
    ? formatMazeTime(props.run.finishedMs)
    : formatMazeTime(localDoneMs ?? props.run.elapsedMs, 1),
);

const xy = (i: number) => [i % n, Math.floor(i / n)] as const;

// ── Ходы ────────────────────────────────────────────────────────────────

/** Шагнуть из текущей клетки. false — там стена. */
function step(d: MazeDir, t0: number): boolean {
  if (!isOpen(bits[pos]!, d)) return false;
  const to = neighbor(n, pos, d);
  if (to === null) return false;
  if (!known[to]) {
    // Сервер ещё не ответил — подождём клетку на месте.
    waiting = d;
    return true;
  }
  waiting = null;
  anim = { from: pos, to, dir: d, t0 };
  const [x, y] = xy(to);
  for (const c of cellsNear(n, x, y, MAZE_LIGHT))
    if (!seen.has(c)) {
      seen.add(c);
      seenDirty = true;
    }
  pos = to;
  path.push(to);
  moves += d;
  groundDirty = true;
  flush();
  return true;
}

/** Фишка встала на клетку: выход — конец; в коридоре едет дальше сама; на
 *  развилке берёт заранее нажатое направление, если туда есть проход. */
function arrive(came: MazeDir, t0: number) {
  if (pos === exit) {
    reachedExit.value = true;
    localDoneMs = t0 - startPerf;
    queued = null;
    groundDirty = true;
    return;
  }
  const here = bits[pos]!;
  if (queued && isOpen(here, queued)) {
    const q = queued;
    queued = null;
    step(q, t0);
    return;
  }
  const next = corridorNext(here, came);
  if (next) step(next, t0);
  else queued = null;
}

function press(d: MazeDir) {
  if (reachedExit.value) return;
  if (anim || waiting) {
    queued = d;
    return;
  }
  const now = performance.now();
  if (!step(d, now)) bump = { dir: d, t0: now };
}

// ── Сеть ────────────────────────────────────────────────────────────────

let sending = false;
let disposed = false;
let retryMs = 500;

async function flush() {
  if (sending || disposed || acked >= moves.length) return;
  sending = true;
  const at = acked;
  const batch = moves.slice(at, at + MAZE_MOVES_PER_REQUEST);
  let again = true;
  try {
    const res = await $fetch<MazeMoveResult>("/api/maze/move", {
      method: "POST",
      body: { runId: props.run.id, at, moves: batch },
    });
    acked = at + batch.length;
    merge(res.cells);
    offline.value = false;
    retryMs = 500;
    // Фишка ждала клетку — идёт с этой минуты, а не догоняет прошлое.
    if (waiting) step(waiting, performance.now());
    if (res.finishedMs !== null && serverMs.value === null) {
      serverMs.value = res.finishedMs;
      celebrate();
      emit("finished", res.finishedMs);
    }
  } catch (e: any) {
    const status = e?.statusCode ?? e?.response?.status;
    if (status && status >= 400 && status < 500) {
      // Сервер видит забег иначе — берём его версию.
      again = false;
      emit("resync");
    } else {
      offline.value = true;
      await new Promise((r) => setTimeout(r, retryMs));
      retryMs = Math.min(retryMs * 2, 8000);
    }
  } finally {
    sending = false;
  }
  if (again) flush();
}

// ── Управление ──────────────────────────────────────────────────────────

const KEYS: Record<string, MazeDir> = {
  ArrowUp: "U",
  ArrowRight: "R",
  ArrowDown: "D",
  ArrowLeft: "L",
  KeyW: "U",
  KeyD: "R",
  KeyS: "D",
  KeyA: "L",
};

function onKey(e: KeyboardEvent) {
  const d = KEYS[e.code];
  if (!d || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, select, [contenteditable]")) return;
  e.preventDefault();
  press(d);
}

// Свайп: направление — по большему сдвигу. Палец не отпускали — можно
// вести дальше, следующий свайп считается от места, где сработал прошлый.
let swipeFrom: { x: number; y: number; id: number } | null = null;
function onPointerDown(e: PointerEvent) {
  if (e.pointerType === "mouse") return;
  swipeFrom = { x: e.clientX, y: e.clientY, id: e.pointerId };
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
}
function onPointerMove(e: PointerEvent) {
  if (!swipeFrom || e.pointerId !== swipeFrom.id) return;
  const dx = e.clientX - swipeFrom.x;
  const dy = e.clientY - swipeFrom.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
  press(
    Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : dy > 0 ? "D" : "U",
  );
  swipeFrom = { x: e.clientX, y: e.clientY, id: e.pointerId };
}
function onPointerUp() {
  swipeFrom = null;
}

// ── Рисование ───────────────────────────────────────────────────────────

const wrap = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
let side = 0;
let dpr = 1;
let floor: Path2D | null = null;
let ground: HTMLCanvasElement | null = null;

// «Уменьшить движение» в системе: снег стоит, искры не мерцают, фея не
// летит, снежинки на финише не разлетаются.
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const snow = makeSnow(140);
let burst: Burst | null = null;
const flakeImg = Object.assign(new Image(), { src: snowflakeUrl });

function resize() {
  const el = wrap.value;
  const c = canvas.value;
  if (!el || !c) return;
  side = el.clientWidth;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  c.width = Math.round(side * dpr);
  c.height = Math.round(side * dpr);
  c.style.width = `${side}px`;
  c.style.height = `${side}px`;
  seenDirty = true;
}

const exitCenter = () => {
  const cs = side / n;
  const [x, y] = xy(exit);
  return [(x + 0.5) * cs, (y + 0.5) * cs] as const;
};

/** Дошли — от окошка разлетаются снежинки. */
function celebrate() {
  if (calm || !side) return;
  const [x, y] = exitCenter();
  burst = makeBurst(x, y, side, side / n, performance.now());
}

/** Фея садится в верхний угол подальше от окошка, чтобы его не закрыть. */
const faeSide = xy(exit)[0] < n / 2 ? "right" : "left";

function draw(now: number) {
  const c = canvas.value;
  const ctx = c?.getContext("2d");
  if (!c || !ctx || !side) return;
  const cs = side / n;
  const done = reachedExit.value;

  if (seenDirty || !floor) {
    floor = new Path2D();
    for (const i of seen) {
      if (!known[i]) continue;
      const [x, y] = xy(i);
      floor.rect(x * cs, y * cs, cs + 0.5, cs + 0.5);
    }
    seenDirty = false;
    groundDirty = true;
  }
  if (groundDirty || !ground) {
    ground ??= document.createElement("canvas");
    ground.width = c.width;
    ground.height = c.height;
    const g = ground.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawNight(g, side);
    drawGround(g, {
      cs,
      floor,
      cells: [...seen].filter((i) => known[i]),
      path,
      xy,
      done,
    });
    groundDirty = false;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(ground, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Где фишка сейчас — в клетках, может быть и между ними.
  let tx: number, ty: number;
  if (anim) {
    const k = Math.min(1, (now - anim.t0) / STEP_MS);
    const [fx, fy] = xy(anim.from);
    const [toX, toY] = xy(anim.to);
    tx = fx + (toX - fx) * k;
    ty = fy + (toY - fy) * k;
  } else {
    [tx, ty] = xy(pos);
  }
  if (bump) {
    const k = (now - bump.t0) / BUMP_MS;
    if (k >= 1) bump = null;
    else {
      const push = 0.14 * Math.sin(Math.PI * k);
      tx += DIR_DX[bump.dir] * push;
      ty += DIR_DY[bump.dir] * push;
    }
  }
  const px = (tx + 0.5) * cs;
  const py = (ty + 0.5) * cs;

  if (!done) drawLantern(ctx, floor, px, py, (MAZE_LIGHT + 0.9) * cs);

  // Стены. Каждую рисует одна клетка: общая стена двух видимых — нижняя
  // или правая у верхней/левой, иначе полупрозрачные легли бы дважды. У
  // фонаря — яркие, дальше — бледные; на финише все ровные.
  const near = new Path2D();
  const far = new Path2D();
  const shown = (i: number | null) => i !== null && known[i] && seen.has(i);
  const reach = done ? -1 : MAZE_LIGHT + 0.5;
  for (const i of seen) {
    if (!known[i]) continue;
    const b = bits[i]!;
    const [x, y] = xy(i);
    const p = Math.hypot(x - tx, y - ty) <= reach ? near : far;
    const x0 = x * cs;
    const y0 = y * cs;
    if (!isOpen(b, "U") && !shown(neighbor(n, i, "U"))) {
      p.moveTo(x0, y0);
      p.lineTo(x0 + cs, y0);
    }
    if (!isOpen(b, "L") && !shown(neighbor(n, i, "L"))) {
      p.moveTo(x0, y0);
      p.lineTo(x0, y0 + cs);
    }
    if (!isOpen(b, "D")) {
      p.moveTo(x0, y0 + cs);
      p.lineTo(x0 + cs, y0 + cs);
    }
    if (!isOpen(b, "R")) {
      p.moveTo(x0 + cs, y0);
      p.lineTo(x0 + cs, y0 + cs);
    }
  }
  drawDrifts(ctx, near, far, cs, done);
  if (!done) drawFrostSparks(ctx, px, py, cs, calm ? 0 : now);

  // Граница лабиринта — чтобы было видно, сколько его ещё впереди.
  ctx.strokeStyle = "rgba(200, 220, 240, 0.08)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, side - 1, side - 1);

  // Окошко видно всегда: куда идти, известно, — как, нет.
  const [ex, ey] = exitCenter();
  drawInnWindow(ctx, ex, ey, cs, calm ? 0 : now);

  if (!done) drawToken(ctx, px, py, cs);

  drawSnow(ctx, snow, side, (fx, fy) => {
    const i = Math.floor(fy * n) * n + Math.floor(fx * n);
    return seen.has(i) && known[i] === 1;
  });

  if (burst && flakeImg.complete && !drawBurst(ctx, burst, now, flakeImg))
    burst = null;
}

let raf = 0;
let lastTimeText = 0;
let lastFrame = 0;
function frame(now: number) {
  const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  if (!calm) stepSnow(snow, dt, now);
  // Пройденные за кадр клетки отсчитываются от того, когда шаг должен был
  // закончиться, а не от кадра: медленный телефон не идёт медленнее.
  while (anim && now - anim.t0 >= STEP_MS) {
    const end = anim.t0 + STEP_MS;
    const came = anim.dir;
    anim = null;
    arrive(came, end);
  }
  if (now - lastTimeText > 90) {
    lastTimeText = now;
    timeText.value =
      serverMs.value !== null
        ? formatMazeTime(serverMs.value)
        : formatMazeTime(localDoneMs ?? now - startPerf, 1);
  }
  draw(now);
  // Стоит ли фишка — для сценариев: ход, нажатый на ходу, ждёт развилки.
  // Пишем, только когда меняется: на проде каждую правку DOM записывает Clarity.
  const el = wrap.value;
  const idle = anim || waiting || bump ? "0" : "1";
  if (el && el.dataset.idle !== idle) el.dataset.idle = idle;
  raf = requestAnimationFrame(frame);
}

let observer: ResizeObserver | null = null;
onMounted(() => {
  resize();
  observer = new ResizeObserver(resize);
  if (wrap.value) observer.observe(wrap.value);
  window.addEventListener("keydown", onKey);
  raf = requestAnimationFrame(frame);
});
onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(raf);
  observer?.disconnect();
  window.removeEventListener("keydown", onKey);
});

const dirs: { d: MazeDir; label: string }[] = [
  { d: "U", label: "Вверх" },
  { d: "L", label: "Влево" },
  { d: "R", label: "Вправо" },
  { d: "D", label: "Вниз" },
];

const status = computed(() => {
  if (serverMs.value !== null)
    return `В тепле! Время — ${formatMazeTime(serverMs.value)}`;
  if (reachedExit.value) return "Окошко рядом… сверяем время";
  return "Иди на огонёк таверны";
});
</script>

<template>
  <div class="maze-board">
    <div class="bar">
      <span class="time display" :class="{ done: serverMs !== null }">{{
        timeText
      }}</span>
      <span v-if="offline" class="offline">Нет связи — ходы дойдут позже</span>
    </div>

    <div class="field-wrap">
      <div
        ref="wrap"
        class="field"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <canvas ref="canvas" role="img" :aria-label="`Лабиринт ${n}×${n}`" />
      </div>
      <SnowCap />
      <NuxtImg
        v-if="serverMs !== null"
        src="/faerie.webp"
        alt=""
        aria-hidden="true"
        width="180"
        height="246"
        class="fae"
        :class="`fae--${faeSide}`"
      />
    </div>

    <p
      class="status"
      :class="{ done: serverMs !== null }"
      role="status"
      aria-live="polite"
    >
      {{ status }}
    </p>

    <div v-if="!reachedExit" class="pad">
      <button
        v-for="b in dirs"
        :key="b.d"
        type="button"
        class="pad-btn"
        :class="`pad-${b.d}`"
        :aria-label="b.label"
        @click="press(b.d)"
      >
        <span class="arrow" aria-hidden="true" />
      </button>
    </div>
    <p v-if="!reachedExit" class="hint">
      Стрелки или WASD, на телефоне — свайпы. По коридору фишка идёт сама до
      развилки.
    </p>
  </div>
</template>

<style scoped>
.maze-board {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.bar {
  display: flex;
  align-items: baseline;
  gap: 14px;
  min-height: 32px;
}

.time {
  font-size: 28px;
  font-variant-numeric: tabular-nums;
  color: var(--parchment);
}

.time.done {
  color: #ffcf7a;
}

.offline {
  font-size: 12px;
  color: var(--danger);
}

/* Обёртка держит снежную шапку и фею: они выступают за край поля, а
   само поле обрезано по скруглению. */
.field-wrap {
  position: relative;
  width: min(100%, calc(100svh - 300px), 640px);
  min-width: 240px;
  aspect-ratio: 1;
  margin-top: 6px;
}

.field {
  width: 100%;
  height: 100%;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  border-radius: var(--radius-sm);
  overflow: hidden;
  box-shadow:
    0 0 0 1px rgba(200, 220, 240, 0.14),
    0 18px 40px -18px rgba(0, 0, 0, 0.9);
}

/* Айволет прилетает на финише и садится в угол подальше от окошка. */
.fae {
  position: absolute;
  top: -9%;
  width: clamp(64px, 18%, 104px);
  height: auto;
  pointer-events: none;
  filter: drop-shadow(0 0 12px rgba(170, 220, 255, 0.8));
  animation:
    fae-in 1.4s ease-out both,
    fae-hover 4.8s ease-in-out 1.4s infinite;
}

.fae--right {
  right: -6%;
}

.fae--left {
  left: -6%;
}

@keyframes fae-in {
  from {
    opacity: 0;
    transform: translate(70%, -15%) rotate(14deg);
  }
  to {
    opacity: 1;
    transform: translate(0, 0) rotate(-6deg);
  }
}

@keyframes fae-hover {
  0%,
  100% {
    transform: translateY(0) rotate(-6deg);
  }
  50% {
    transform: translateY(-6px) rotate(-3deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fae {
    animation: none;
    transform: rotate(-6deg);
  }
}

.field canvas {
  display: block;
}

.status {
  margin: 0;
  min-height: 20px;
  font-size: 15px;
  color: #ffcf7a;
}

.status.done {
  font-family: var(--font-display);
  font-size: 18px;
}

.pad {
  display: grid;
  grid-template-columns: repeat(3, 48px);
  grid-template-rows: repeat(3, 40px);
  gap: 4px;
}

.pad-U {
  grid-area: 1 / 2;
}
.pad-L {
  grid-area: 2 / 1;
}
.pad-R {
  grid-area: 2 / 3;
}
.pad-D {
  grid-area: 3 / 2;
}

.pad-btn {
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--fill);
  color: var(--parchment);
  cursor: pointer;
  touch-action: manipulation;
}

.pad-btn:hover {
  background: var(--fill-bold);
}

.pad-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.arrow {
  width: 10px;
  height: 10px;
  border-left: 2px solid var(--ember-soft);
  border-top: 2px solid var(--ember-soft);
}
.pad-U .arrow {
  transform: translateY(2px) rotate(45deg);
}
.pad-R .arrow {
  transform: translateX(-2px) rotate(135deg);
}
.pad-D .arrow {
  transform: translateY(-2px) rotate(225deg);
}
.pad-L .arrow {
  transform: translateX(2px) rotate(-45deg);
}

.hint {
  margin: 0;
  max-width: 420px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

@media (pointer: coarse) {
  /* На телефоне управляют свайпами — кнопки остаются, но мельче. */
  .pad {
    grid-template-columns: repeat(3, 44px);
    grid-template-rows: repeat(3, 36px);
  }
}
</style>
