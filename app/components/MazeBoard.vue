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

/**
 * Поле лабиринта. Целиком лабиринт знает только сервер: здесь — клетки, которые
 * он уже открыл. Фишка идёт сразу, не дожидаясь ответа, а ходы уходят на
 * сервер пачками в фоне; в ответ приходят клетки дальше по дороге. Если ответ
 * запоздал и следующей клетки ещё нет, фишка ждёт её на месте.
 *
 * Видно то, что вокруг пройденного, на радиус фонаря. Открытое сервером чуть
 * дальше фонаря не рисуется: оно нужно, чтобы не ждать сети на каждом шаге.
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
// клеток стало больше — и видимых, и пришедших с сервера.
let seenDirty = true;
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
const timeText = ref(formatMazeTime(localDoneMs ?? props.run.elapsedMs));

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
let seenPath: Path2D | null = null;

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

const COLORS = {
  void: "#0f0b08",
  floor: "#2a2019",
  light: "255, 196, 128",
  wallNear: "rgba(241, 230, 210, 0.92)",
  wallFar: "rgba(241, 230, 210, 0.3)",
  trail: "rgba(214, 136, 62, 0.4)",
  token: "#e8a15a",
  exit: "242, 193, 78",
};

function draw(now: number) {
  const ctx = canvas.value?.getContext("2d");
  if (!ctx || !side) return;
  const cs = side / n;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.void;
  ctx.fillRect(0, 0, side, side);

  if (seenDirty || !seenPath) {
    seenPath = new Path2D();
    for (const c of seen) {
      if (!known[c]) continue;
      const [x, y] = xy(c);
      seenPath.rect(x * cs, y * cs, cs + 0.5, cs + 0.5);
    }
    seenDirty = false;
  }
  ctx.fillStyle = COLORS.floor;
  ctx.fill(seenPath);

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

  // Фонарь.
  const lr = (MAZE_LIGHT + 0.8) * cs;
  const glow = ctx.createRadialGradient(px, py, 0, px, py, lr);
  glow.addColorStop(0, `rgba(${COLORS.light}, 0.34)`);
  glow.addColorStop(0.6, `rgba(${COLORS.light}, 0.12)`);
  glow.addColorStop(1, `rgba(${COLORS.light}, 0)`);
  ctx.save();
  ctx.clip(seenPath);
  ctx.fillStyle = glow;
  ctx.fillRect(px - lr, py - lr, lr * 2, lr * 2);
  ctx.restore();

  // Пройденный путь.
  if (path.length > 1) {
    ctx.beginPath();
    path.forEach((c, i) => {
      const [x, y] = xy(c);
      const cx = (x + 0.5) * cs;
      const cy = (y + 0.5) * cs;
      if (i) ctx.lineTo(cx, cy);
      else ctx.moveTo(cx, cy);
    });
    ctx.strokeStyle = COLORS.trail;
    ctx.lineWidth = Math.max(1.5, cs * 0.12);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // Стены. Каждую рисует одна клетка: общая стена двух видимых — нижняя
  // или правая у верхней/левой, иначе полупрозрачные легли бы дважды.
  const near = new Path2D();
  const far = new Path2D();
  const shown = (c: number | null) => c !== null && known[c] && seen.has(c);
  const reach = MAZE_LIGHT + 0.5;
  for (const c of seen) {
    if (!known[c]) continue;
    const b = bits[c]!;
    const [x, y] = xy(c);
    const p = Math.hypot(x - tx, y - ty) <= reach ? near : far;
    const x0 = x * cs;
    const y0 = y * cs;
    if (!isOpen(b, "U") && !shown(neighbor(n, c, "U"))) {
      p.moveTo(x0, y0);
      p.lineTo(x0 + cs, y0);
    }
    if (!isOpen(b, "L") && !shown(neighbor(n, c, "L"))) {
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
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, cs * 0.1);
  ctx.strokeStyle = COLORS.wallFar;
  ctx.stroke(far);
  ctx.strokeStyle = COLORS.wallNear;
  ctx.stroke(near);

  // Граница лабиринта — чтобы было видно, сколько его ещё впереди.
  ctx.strokeStyle = "rgba(241, 230, 210, 0.08)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, side - 1, side - 1);

  // Выход видно всегда: куда идти, известно, — как, нет.
  const [ex, ey] = xy(exit);
  const ecx = (ex + 0.5) * cs;
  const ecy = (ey + 0.5) * cs;
  const pulse = 0.5 + 0.5 * Math.sin(now / 380);
  const er = cs * (1.1 + 0.35 * pulse);
  const eg = ctx.createRadialGradient(ecx, ecy, 0, ecx, ecy, er);
  eg.addColorStop(0, `rgba(${COLORS.exit}, 0.75)`);
  eg.addColorStop(1, `rgba(${COLORS.exit}, 0)`);
  ctx.fillStyle = eg;
  ctx.fillRect(ecx - er, ecy - er, er * 2, er * 2);
  ctx.fillStyle = `rgb(${COLORS.exit})`;
  ctx.beginPath();
  const s = cs * 0.22;
  ctx.moveTo(ecx, ecy - s);
  ctx.lineTo(ecx + s, ecy);
  ctx.lineTo(ecx, ecy + s);
  ctx.lineTo(ecx - s, ecy);
  ctx.closePath();
  ctx.fill();

  // Фишка.
  ctx.save();
  ctx.shadowColor = "rgba(232, 161, 90, 0.9)";
  ctx.shadowBlur = cs * 0.6;
  ctx.fillStyle = COLORS.token;
  ctx.beginPath();
  ctx.arc(px, py, Math.max(3, cs * 0.3), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

let raf = 0;
let lastTimeText = 0;
function frame(now: number) {
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
    timeText.value = formatMazeTime(
      serverMs.value ?? localDoneMs ?? now - startPerf,
    );
  }
  draw(now);
  // Стоит ли фишка — для сценариев: ход, нажатый на ходу, ждёт развилки.
  const el = wrap.value;
  if (el) el.dataset.idle = anim || waiting || bump ? "0" : "1";
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
    return `Выход найден за ${formatMazeTime(serverMs.value)}`;
  if (reachedExit.value) return "Выход! Сверяем время…";
  return "";
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

    <p class="status" role="status" aria-live="polite">{{ status }}</p>

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
  color: var(--gold);
}

.offline {
  font-size: 12px;
  color: var(--danger);
}

.field {
  width: min(100%, calc(100svh - 300px), 640px);
  min-width: 240px;
  aspect-ratio: 1;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  border-radius: var(--radius-sm);
  overflow: hidden;
  box-shadow:
    0 0 0 1px var(--line),
    var(--shadow-card-lift);
}

.field canvas {
  display: block;
}

.status {
  margin: 0;
  min-height: 20px;
  font-size: 15px;
  color: var(--gold);
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
