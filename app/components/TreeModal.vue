<script setup lang="ts">
import type {
  NameTitle,
  ShakeResult,
  TitleSwap,
  TreeState,
  TreeWordKind,
} from "#shared/utils/tree";
import { TREE_HITS, fullTreeTexts } from "#shared/utils/tree";

/**
 * Окно новогодней ёлки. Ёлку трясут: на компьютере — кликами по ней, на
 * телефоне — самим телефоном (или тапами, если датчика нет). После
 * TREE_HITS ударов сервер решает, что выпало, а окно роняет подарки — два или
 * три. Каждый открывают нажатием, из слов складывается титул. Его берут —
 * и прежний пропадает насовсем, — или оставляют свой: трясти можно в надежде
 * на лучший. Не решил сразу — взять можно до полуночи.
 *
 * Гость трясёт ёлку так же, но подарки достаются только вошедшим — в конце
 * его зовут войти, и после входа главная откроет окно сама (?tree=1).
 */
const emit = defineEmits<{ close: []; shaken: [] }>();

const auth = useAuthStore();
useScrollLock();

type Phase =
  | "loading"
  | "ready"
  | "dropping"
  | "gifts"
  | "result"
  | "taken"
  | "today"
  | "guest"
  | "error";

const phase = ref<Phase>("loading");
const state = ref<TreeState | null>(null);
const error = ref("");
const t = computed(() => state.value?.texts ?? fullTreeTexts(null));

const hits = ref(0);
const result = ref<ShakeResult | null>(null);
const opened = ref<boolean[]>([]);
const today = ref<NameTitle | null>(null);
const current = ref<NameTitle | null>(null);
const swaps = ref<TitleSwap[]>([]);
const isAdmin = computed(() => auth.isAdmin);
const taking = ref(false);
const takeError = ref("");

const loginHref = `/login?next=${encodeURIComponent("/?tree=1")}`;

const load = async () => {
  try {
    state.value = await $fetch<TreeState>("/api/tree");
  } catch (e: any) {
    error.value = e.data?.message || "Ёлка не загрузилась";
    phase.value = "error";
    return;
  }
  const me = state.value.me;
  current.value = me?.current ?? null;
  swaps.value = me?.swaps ?? [];
  if (me && !me.canShake && me.today) {
    today.value = me.today;
    phase.value = "today";
    return;
  }
  phase.value = "ready";
};

// ── Встряска ──────────────────────────────────
// Качается обёртка ёлки целиком: CSS-анимация с размахом от числа ударов.
// Перезапуск — сменой имени анимации между двумя одинаковыми: иначе браузер
// не начнёт заново ту, что уже идёт.
const swayFlip = ref(false);
const swayAmp = ref(0);
const swayStyle = computed(() =>
  swayAmp.value
    ? {
        "--amp": `${swayAmp.value}deg`,
        animationName: swayFlip.value ? "tree-sway-a" : "tree-sway-b",
      }
    : {},
);

// Снежинки, что слетают с лап при ударе. Живут секунду и убираются.
type Flake = { id: number; x: number; y: number; d: number; s: number };
const flakes = ref<Flake[]>([]);
let flakeId = 0;
const dropFlakes = () => {
  const now = flakes.value.filter((f) => f.id > flakeId - 24);
  for (let i = 0; i < 6; i++)
    now.push({
      id: ++flakeId,
      x: 18 + Math.random() * 64,
      y: 20 + Math.random() * 55,
      d: Math.random() * 0.25,
      s: 3 + Math.random() * 4,
    });
  flakes.value = now;
};

// ── Колокольчики ──────────────────────────────
// Лёгкий звон на каждый удар — синтезом, без файлов: две-три крошечные
// нотки колокольчика из пентатоники, и с каждым ударом выше. Колокольчик —
// синус с двумя негармоничными призвуками, быстрое нарастание и затухание.
// Звук браузер пускает после касания: контекст заводится на первом ударе.
let actx: AudioContext | null = null;
const NOTES = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349.3, 2637];
const PARTIALS = [
  { ratio: 1, amp: 1, decay: 0.55 },
  { ratio: 2.76, amp: 0.35, decay: 0.25 },
  { ratio: 5.4, amp: 0.15, decay: 0.12 },
];

const bell = (ctx: AudioContext, out: AudioNode, freq: number, at: number) => {
  for (const p of PARTIALS) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.value = freq * p.ratio;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.08 * p.amp, at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + p.decay);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + p.decay + 0.05);
  }
};

const jingle = (step: number) => {
  try {
    actx ??= new AudioContext();
    if (actx.state === "suspended") actx.resume().catch(() => {});
    const out = actx.createGain();
    out.gain.value = 0.6;
    out.connect(actx.destination);
    const t = actx.currentTime + 0.01;
    const base = Math.min(step, NOTES.length - 3);
    const n = 2 + Math.round(Math.random());
    for (let k = 0; k < n; k++) {
      const note = NOTES[base + Math.floor(Math.random() * 3)]!;
      bell(actx, out, note, t + k * 0.045 + Math.random() * 0.015);
    }
  } catch {
    // Нет звука в браузере — ёлка трясётся молча.
  }
};

const hit = () => {
  if (phase.value !== "ready") return;
  hits.value++;
  swayAmp.value = Math.min(2 + hits.value * 1.6, 10);
  swayFlip.value = !swayFlip.value;
  dropFlakes();
  jingle(hits.value - 1);
  navigator.vibrate?.(18);
  if (hits.value >= TREE_HITS) finish();
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Кот ───────────────────────────────────────
// Пока сыплются подарки, из ёлки выглядывает кот, срывается с «[Мяу!]» и
// молнией удирает. Первый раз — всегда, дальше — редким сюрпризом, в одной
// встряске из двадцати пяти: иначе приестся. При «меньше движения» кота нет.
const CAT_KEY = "tree-cat-seen";
const CAT_CHANCE = 0.04;
const cat = ref(false);
let catTimer: ReturnType<typeof setTimeout> | undefined;

const wantCat = () => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    if (!localStorage.getItem(CAT_KEY)) {
      localStorage.setItem(CAT_KEY, "1");
      return true;
    }
  } catch {
    // Хранилище закрыто — просто жребий.
  }
  return Math.random() < CAT_CHANCE;
};

// Мяу — «Meow», IgnasD, OpenGameArt, CC0 (см. public/tree/LICENSE.txt).
// iPhone даёт звуку играть только после касания, причём тому же элементу:
// поэтому плеер заводится на первом тапе по ёлке, беззвучно, и потом
// мяукает уже без касания. Android и компьютер пускают и так.
let meow: HTMLAudioElement | null = null;
const MEOW_VOLUME = 0.55;

const primeMeow = () => {
  if (meow) return;
  meow = new Audio("/tree/cat-meow.wav");
  meow.preload = "auto";
  meow.muted = true;
  meow
    .play()
    .then(() => meow?.pause())
    .catch(() => {})
    .finally(() => {
      if (!meow) return;
      meow.currentTime = 0;
      meow.muted = false;
    });
};

const playMeow = () => {
  if (!meow || meow.error) meow = new Audio("/tree/cat-meow.wav");
  meow.muted = false;
  meow.volume = MEOW_VOLUME;
  meow.currentTime = 0;
  meow.play().catch(() => {});
};

const runCat = () => {
  if (!wantCat()) return;
  cat.value = true;
  clearTimeout(catTimer);
  setTimeout(() => {
    playMeow();
    navigator.vibrate?.([30, 40, 30]);
  }, 950);
  catTimer = setTimeout(() => (cat.value = false), 2400);
};

const finish = async () => {
  stopMotion();
  if (!state.value?.me) {
    await wait(500);
    phase.value = "guest";
    return;
  }
  phase.value = "dropping";
  runCat();
  try {
    const [res] = await Promise.all([
      $fetch<ShakeResult>("/api/tree/shake", { method: "POST" }),
      // Дать ёлке докачаться: подарки падают, когда она ещё дрожит.
      wait(450),
    ]);
    result.value = res;
    current.value = res.current;
    swaps.value = res.swaps;
    opened.value = res.gifts.map(() => false);
    phase.value = "gifts";
    emit("shaken");
  } catch (e: any) {
    error.value = e.data?.message || "Ёлка не отдала подарки — попробуй ещё";
    phase.value = "error";
  }
};

const allOpen = computed(
  () => opened.value.length > 0 && opened.value.every(Boolean),
);

const openGift = async (i: number) => {
  if (phase.value !== "gifts" || opened.value[i]) return;
  opened.value[i] = true;
  navigator.vibrate?.(12);
  if (allOpen.value) {
    await wait(900);
    if (phase.value === "gifts") phase.value = "result";
  }
};

/** Взять выпавший титул вместо надетого. Прежний пропадает насовсем. */
/** slot — не целиком, а одно слово из выпавшего в свой титул. */
const take = async (title: NameTitle, slot?: TreeWordKind) => {
  taking.value = true;
  takeError.value = "";
  try {
    current.value = await $fetch<NameTitle>("/api/tree/take", {
      method: "POST",
      body: { id: title.id, slot },
    });
    today.value = current.value;
    swaps.value = [];
    phase.value = "taken";
    emit("shaken");
  } catch (e: any) {
    takeError.value = e.data?.message || "Не получилось — попробуй ещё";
  } finally {
    taking.value = false;
  }
};

/** Сегодняшний титул ещё не взят — его можно взять до полуночи. */
const todayOpen = computed(
  () => Boolean(today.value) && today.value?.id !== current.value?.id,
);

/** Админ трясёт сколько угодно — «Ещё раз» возвращает ёлку в начало. */
const again = () => {
  cat.value = false;
  askMotion();
  hits.value = 0;
  swayAmp.value = 0;
  result.value = null;
  opened.value = [];
  error.value = "";
  takeError.value = "";
  swaps.value = [];
  phase.value = "ready";
  startMotion();
};

// Где на земле стоят подарки: два — по бокам, три — ещё один посередине.
const giftSpots = computed(() =>
  (result.value?.gifts.length ?? 0) === 3 ? [20, 50, 80] : [30, 70],
);

// ── Датчик движения ───────────────────────────
// На телефоне ёлку можно трясти самим телефоном. На iPhone датчик дают только
// после нажатия — поэтому разрешение спрашиваем при первом тапе по ёлке (он
// же и засчитывается). Нет датчика или не дали — ёлку тапают, как на компе.
const coarse = ref(false);
const motionOn = ref(false);
let asked = false;
// Рывок — насколько ускорение отличается от силы тяжести. Удар засчитывается
// на пике рывка (сильнее SHAKE_HIGH), а следующий — только когда рывок спал
// (слабее SHAKE_LOW): одно движение рукой — один удар. Соседние замеры идут
// 60 раз в секунду и почти не отличаются, поэтому сравнивать их друг с другом
// нельзя — так встряску не поймать.
let grav: { x: number; y: number; z: number } | null = null;
const SHAKE_HIGH = 11;
const SHAKE_LOW = 4;
let armed = true;
let lastHit = 0;

const joltOf = (e: DeviceMotionEvent): number | null => {
  const lin = e.acceleration;
  if (lin && lin.x != null && lin.y != null && lin.z != null)
    return Math.hypot(lin.x, lin.y, lin.z);
  // Без «чистого» ускорения — сила тяжести по каждой оси отслеживается
  // плавно (она меняется медленно), а рывок — то, что сверх неё.
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null || a.y == null || a.z == null) return null;
  if (!grav) grav = { x: a.x, y: a.y, z: a.z };
  grav.x += (a.x - grav.x) * 0.1;
  grav.y += (a.y - grav.y) * 0.1;
  grav.z += (a.z - grav.z) * 0.1;
  return Math.hypot(a.x - grav.x, a.y - grav.y, a.z - grav.z);
};

const onMotion = (e: DeviceMotionEvent) => {
  const jolt = joltOf(e);
  if (jolt == null) return;
  // Пришли данные — датчик точно работает: подсказка зовёт трясти.
  motionOn.value = true;
  if (!armed) {
    if (jolt < SHAKE_LOW) armed = true;
    return;
  }
  const now = performance.now();
  if (jolt > SHAKE_HIGH && now - lastHit > 250) {
    armed = false;
    lastHit = now;
    hit();
  }
};

// На телефоне датчик слушаем всегда: работает ли он, видно только по
// пришедшим данным — по браузеру не угадать (Chrome, например, теперь тоже
// умеет спрашивать разрешение, но и без ответа шлёт данные).
const startMotion = () => {
  if (!coarse.value || phase.value !== "ready") return;
  window.removeEventListener("devicemotion", onMotion);
  armed = true;
  grav = null;
  window.addEventListener("devicemotion", onMotion);
};

const stopMotion = () => {
  window.removeEventListener("devicemotion", onMotion);
};

/** Спросить разрешение там, где его спрашивают (iPhone). Звать из
 *  обработчика касания — см. utils/motionPermission. Сам датчик уже слушается:
 *  дадут разрешение — данные просто начнут приходить. */
const askMotion = () => {
  if (asked || !coarse.value) return;
  asked = true;
  requestMotion().then((ok) => {
    if (!ok) asked = false;
  });
};

const onTreeTap = () => {
  primeMeow();
  askMotion();
  hit();
};

const close = () => {
  if (phase.value === "dropping") return;
  emit("close");
};

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === "Escape") close();
};

onMounted(() => {
  // Картинки кота — заранее: он выскакивает на секунду, ждать загрузки некогда.
  for (const p of ["peek", "fall", "run"])
    new Image().src = `/tree/cat-${p}.webp`;
  coarse.value = matchMedia("(pointer: coarse)").matches;
  // Разрешение на датчик (где его спрашивают) уже попросила кнопка
  // «Потрясти ёлку»; окно открылось само, после входа, — попросим на первом
  // тапе по ёлке. Слушать датчик начинаем сразу, см. startMotion.
  if (motionAsked()) asked = true;
  document.addEventListener("keydown", onKeydown);
  load().then(startMotion);
});
onUnmounted(() => {
  clearTimeout(catTimer);
  actx?.close().catch(() => {});
  document.removeEventListener("keydown", onKeydown);
  stopMotion();
});

const hint = computed(() => {
  if (phase.value === "dropping") return "Сыплются…";
  if (phase.value === "gifts")
    return allOpen.value ? "" : "Открой подарки — нажми на каждый";
  if (coarse.value)
    return motionOn.value
      ? "Потряси телефон — или тапай по ёлке"
      : "Тапай по ёлке, чтобы она затряслась";
  return "Кликай по ёлке, чтобы она затряслась";
});
</script>

<template>
  <Teleport to="body">
    <div class="tree-backdrop" @click.self="close">
      <div
        class="tree-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tree-title"
      >
        <button
          v-if="phase !== 'dropping'"
          class="tree-close"
          type="button"
          aria-label="Закрыть"
          @click="close"
        >
          ×
        </button>

        <h2 id="tree-title" class="display tree-title">{{ t.tree_title }}</h2>

        <!-- Сцена: ёлка, снег с лап, подарки на земле -->
        <div
          v-if="phase !== 'result' && phase !== 'taken' && phase !== 'error'"
          class="stage"
          :class="{ 'is-dim': phase === 'gifts' }"
        >
          <!-- Фон: свет, огоньки, снег и сугроб — чтобы ёлка не висела в
               пустоте. Весь фон неподвижен, кроме снега. -->
          <div class="scene" aria-hidden="true">
            <span class="scene-glow" />
            <span class="scene-bokeh" />
            <span class="scene-snow scene-snow--far" />
            <span class="scene-snow scene-snow--near" />
            <span class="scene-ground" />
          </div>

          <button
            class="tree-hit"
            type="button"
            :disabled="phase !== 'ready'"
            :aria-label="`Потрясти ёлку (${hits} из ${TREE_HITS})`"
            @click="onTreeTap"
          >
            <span class="tree-sway" :style="swayStyle">
              <TreeArt :shaking="hits > 0" />
            </span>
          </button>

          <span
            v-for="f in flakes"
            :key="f.id"
            class="flake"
            :style="{
              left: `${f.x}%`,
              top: `${f.y}%`,
              width: `${f.s}px`,
              height: `${f.s}px`,
              animationDelay: `${f.d}s`,
            }"
            aria-hidden="true"
          />

          <div v-if="cat" class="cat" aria-hidden="true">
            <img
              class="cat-peek"
              src="/tree/cat-peek.webp"
              width="300"
              height="229"
              alt=""
            />
            <img
              class="cat-fall"
              src="/tree/cat-fall.webp"
              width="320"
              height="215"
              alt=""
            />
            <span class="cat-meow">[Мяу!]</span>
            <span class="cat-puff" />
            <span class="cat-trail" />
            <img
              class="cat-run"
              src="/tree/cat-run.webp"
              width="400"
              height="216"
              alt=""
            />
          </div>

          <template
            v-if="result && (phase === 'gifts' || phase === 'dropping')"
          >
            <button
              v-for="(g, i) in result.gifts"
              :key="i"
              class="gift-spot"
              type="button"
              :style="{
                left: `${giftSpots[i]}%`,
                animationDelay: `${i * 0.18}s`,
              }"
              :aria-label="opened[i] ? g.word : 'Открыть подарок'"
              :disabled="opened[i]"
              @click="openGift(i)"
            >
              <!-- Слово над своим подарком. Через одно — выше: соседние
                   слова длиннее, чем расстояние между коробками, и в одну
                   линию наезжали бы друг на друга. -->
              <span
                v-if="opened[i]"
                class="gift-word"
                :class="{
                  'is-rare': g.tier,
                  'is-high': i % 2 === 1,
                  'is-small': result.gifts.length === 3,
                }"
                :style="g.tier ? { '--tier': g.tier.color } : undefined"
                >{{ g.word
                }}<span v-if="g.tier" class="gift-word-tag">{{
                  g.tier.name
                }}</span></span
              >
              <TreeGift
                :tone="i"
                :rare="Boolean(g.tier && g.tier.id > 0)"
                :uncommon="g.tier?.id === 0"
                :open="opened[i]!"
              />
            </button>
          </template>
        </div>

        <!-- Счёт ударов -->
        <div
          v-if="phase === 'ready' || phase === 'loading'"
          class="hits"
          aria-hidden="true"
        >
          <span
            v-for="n in TREE_HITS"
            :key="n"
            class="hit-dot"
            :class="{ on: n <= hits }"
          />
        </div>

        <p
          v-if="phase === 'ready' || phase === 'dropping' || phase === 'gifts'"
          class="tree-hint"
          aria-live="polite"
        >
          {{ hint }}
        </p>

        <!-- Что сложилось: взять или оставить свой -->
        <div v-if="phase === 'result' && result" class="result">
          <TreePlaque :title="result.title" kicker="Выпал титул" />
          <TreeSwap
            v-if="current"
            :current="current"
            :swaps="swaps"
            :busy="taking"
            @pick="(slot) => take(result!.title, slot)"
          />
          <p v-else class="result-note">
            Встанет у твоего имени — в комментариях и на твоей странице.
          </p>
          <p v-if="takeError" class="tree-err">{{ takeError }}</p>
          <div class="actions">
            <button
              v-if="isAdmin"
              class="btn btn--ghost"
              type="button"
              @click="again"
            >
              Ещё раз
            </button>
            <button
              class="btn btn--ghost"
              type="button"
              :disabled="taking"
              @click="emit('close')"
            >
              {{ current ? "Оставить свой" : "Не надо" }}
            </button>
            <button
              class="btn btn--primary"
              type="button"
              :disabled="taking"
              @click="take(result.title)"
            >
              {{
                current
                  ? swaps.length
                    ? "Взять целиком"
                    : "Взять новый"
                  : "Взять"
              }}
            </button>
          </div>
        </div>

        <!-- Взял -->
        <div v-if="phase === 'taken' && current" class="result">
          <TreePlaque :title="current" kicker="Получен титул" />
          <p class="result-note">
            Титул уже у твоего имени — в комментариях и на твоей странице. Снять
            его можно после полуночи.
          </p>
          <div class="actions">
            <button
              v-if="isAdmin"
              class="btn btn--ghost"
              type="button"
              @click="again"
            >
              Ещё раз
            </button>
            <button
              class="btn btn--primary"
              type="button"
              @click="emit('close')"
            >
              Готово
            </button>
          </div>
        </div>

        <!-- Сегодня уже трясли -->
        <div v-if="phase === 'today' && today" class="result">
          <TreePlaque
            :title="today"
            :kicker="todayOpen ? 'Ёлка припасла тебе титул' : 'Титул дня'"
          />
          <template v-if="todayOpen">
            <TreeSwap
              v-if="current"
              :current="current"
              :swaps="swaps"
              :busy="taking"
              @pick="(slot) => take(today!, slot)"
            />
            <p class="result-note">Взять его можно до полуночи.</p>
            <p v-if="takeError" class="tree-err">{{ takeError }}</p>
            <div class="actions">
              <button
                class="btn btn--ghost"
                type="button"
                :disabled="taking"
                @click="emit('close')"
              >
                {{ current ? "Оставить свой" : "Не надо" }}
              </button>
              <button
                class="btn btn--primary"
                type="button"
                :disabled="taking"
                @click="take(today)"
              >
                Взять
              </button>
            </div>
          </template>
          <p class="result-note">Новые подарки — после полуночи.</p>
        </div>

        <!-- Гость дотряс -->
        <div v-if="phase === 'guest'" class="result">
          <p class="result-note">
            Подарки с ёлки достаются только вошедшим — войди, и она отдаст тебе
            твой титул.
          </p>
          <NuxtLink class="btn btn--primary btn--lg" :to="loginHref"
            >Войти и потрясти</NuxtLink
          >
        </div>

        <p v-if="phase === 'error'" class="tree-err">{{ error }}</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tree-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-reel);
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(10, 12, 18, 0.86);
}

.tree-sheet {
  position: relative;
  width: min(460px, 100%);
  max-height: calc(100dvh - 32px);
  overflow: hidden auto;
  padding: 26px 22px 24px;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(111, 191, 139, 0.55);
  /* Праздничный красный, по макету: светлее сверху, хвойный отсвет снизу. */
  background:
    radial-gradient(
      90% 60% at 50% 0%,
      rgba(255, 205, 195, 0.18),
      transparent 70%
    ),
    radial-gradient(
      80% 40% at 50% 100%,
      rgba(111, 191, 139, 0.14),
      transparent 70%
    ),
    #7a1f2b;
  color: var(--parchment);
  text-align: center;
  box-shadow: var(--shadow-dialog);
}

.tree-sheet :deep(.btn--primary) {
  background: #62ad80;
  color: #10241a;
}

.tree-close {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: var(--radius-round);
  background: none;
  color: rgba(241, 230, 210, 0.6);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.tree-close:hover {
  background: var(--fill-strong);
  color: var(--parchment);
}

.tree-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
}

/* ── Сцена ─────────────────────────────────── */
.stage {
  position: relative;
  width: min(300px, 100%);
  margin: 0 auto;
  /* Место под подарками: они встают на снег у ствола. */
  padding-bottom: 8px;
}

/* ── Фон за ёлкой ─────────────────────────── */
.scene {
  position: absolute;
  z-index: 0;
  inset: -10px -60px -6px;
  overflow: hidden;
  pointer-events: none;
  /* Края растворяются в окне — без рамки. */
  -webkit-mask-image: radial-gradient(
    ellipse 60% 62% at 50% 55%,
    #000 55%,
    transparent 100%
  );
  mask-image: radial-gradient(
    ellipse 60% 62% at 50% 55%,
    #000 55%,
    transparent 100%
  );
}

.scene > * {
  position: absolute;
  display: block;
}

/* Тёплый свет за ёлкой, как от камина в таверне. */
.scene-glow {
  inset: 0;
  background:
    radial-gradient(
      ellipse 42% 50% at 50% 52%,
      rgba(255, 196, 120, 0.3),
      transparent 70%
    ),
    radial-gradient(
      ellipse 70% 40% at 50% 100%,
      rgba(255, 235, 210, 0.12),
      transparent 70%
    );
}

/* Огоньки гирлянды не в фокусе — размытые цветные круги. Неподвижны. */
.scene-bokeh {
  inset: 0;
  opacity: 0.55;
  background:
    radial-gradient(
      circle at 14% 22%,
      rgba(255, 214, 120, 0.7) 0 6px,
      transparent 13px
    ),
    radial-gradient(
      circle at 86% 18%,
      rgba(255, 140, 120, 0.6) 0 5px,
      transparent 12px
    ),
    radial-gradient(
      circle at 9% 58%,
      rgba(150, 220, 170, 0.55) 0 7px,
      transparent 15px
    ),
    radial-gradient(
      circle at 92% 50%,
      rgba(255, 214, 120, 0.65) 0 6px,
      transparent 14px
    ),
    radial-gradient(
      circle at 20% 82%,
      rgba(169, 211, 239, 0.55) 0 5px,
      transparent 12px
    ),
    radial-gradient(
      circle at 80% 78%,
      rgba(255, 170, 110, 0.6) 0 7px,
      transparent 15px
    ),
    radial-gradient(
      circle at 30% 8%,
      rgba(169, 211, 239, 0.5) 0 4px,
      transparent 10px
    ),
    radial-gradient(
      circle at 70% 6%,
      rgba(255, 214, 120, 0.55) 0 4px,
      transparent 10px
    );
  filter: blur(2px);
}

/* Снег: плитка точек, слой длиннее сцены на одну плитку и едет вниз ровно
   на неё — шов не виден. Два слоя с разной скоростью дают глубину. */
.scene-snow {
  left: 0;
  right: 0;
  top: -120px;
  bottom: 0;
  background-image:
    radial-gradient(circle, rgba(255, 255, 255, 0.85) 1.1px, transparent 1.8px),
    radial-gradient(circle, rgba(255, 255, 255, 0.6) 0.9px, transparent 1.5px);
  background-size:
    70px 120px,
    110px 120px;
  background-position:
    10px 14px,
    46px 72px;
  will-change: transform;
  animation: scene-snow 9s linear infinite;
}

.scene-snow--near {
  top: -160px;
  background-image:
    radial-gradient(circle, rgba(255, 255, 255, 0.95) 1.8px, transparent 2.6px),
    radial-gradient(circle, rgba(255, 255, 255, 0.75) 1.4px, transparent 2.2px);
  background-size:
    130px 160px,
    170px 160px;
  background-position:
    30px 40px,
    100px 118px;
  animation: scene-snow-near 6s linear infinite;
}

@keyframes scene-snow {
  to {
    transform: translateY(120px);
  }
}

@keyframes scene-snow-near {
  to {
    transform: translateY(160px);
  }
}

/* Сугроб под ёлкой — на нём и стоят подарки. Не ровный овал, а несколько
   мягких холмиков разной высоты: светлые макушки, голубоватая тень у
   основания и редкие искорки инея. */
.scene-ground {
  left: 4%;
  right: 4%;
  bottom: -4px;
  height: 64px;
  background:
    radial-gradient(1.5px 1.5px at 22% 48%, #fff 60%, transparent),
    radial-gradient(1.5px 1.5px at 61% 40%, #fff 60%, transparent),
    radial-gradient(1.2px 1.2px at 78% 58%, #fff 60%, transparent),
    radial-gradient(1.2px 1.2px at 40% 62%, #fff 60%, transparent),
    radial-gradient(
      ellipse 30% 46% at 24% 74%,
      rgba(255, 255, 255, 0.95) 40%,
      rgba(225, 236, 248, 0.85) 62%,
      transparent 72%
    ),
    radial-gradient(
      ellipse 34% 58% at 56% 70%,
      rgba(255, 255, 255, 0.97) 38%,
      rgba(225, 236, 248, 0.85) 62%,
      transparent 72%
    ),
    radial-gradient(
      ellipse 26% 40% at 82% 78%,
      rgba(250, 252, 255, 0.92) 40%,
      rgba(220, 233, 246, 0.8) 62%,
      transparent 72%
    ),
    radial-gradient(
      ellipse 52% 34% at 50% 92%,
      rgba(206, 222, 240, 0.85),
      rgba(170, 196, 226, 0.45) 60%,
      transparent 75%
    );
  filter: drop-shadow(0 -2px 6px rgba(255, 255, 255, 0.25));
}

.tree-hit {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.tree-hit:disabled {
  cursor: default;
}

.tree-hit:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 4px;
  border-radius: var(--radius-md);
}

/* Качается обёртка целиком — рисунок растрируется один раз. */
.tree-sway {
  display: block;
  transform-origin: 50% 98%;
  animation-duration: 0.9s;
  animation-timing-function: ease-out;
  will-change: transform;
}

.stage.is-dim .tree-sway {
  opacity: 0.32;
  transition: opacity 0.5s;
}

.flake {
  position: absolute;
  z-index: 1;
  border-radius: 50%;
  background: #f4f8fc;
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.7);
  pointer-events: none;
  opacity: 0;
  animation: flake-fall 1.1s ease-in forwards;
}

@keyframes flake-fall {
  0% {
    opacity: 0.95;
    transform: translate(0, 0);
  }
  100% {
    opacity: 0;
    transform: translate(6px, 90px);
  }
}

/* ── Подарки ───────────────────────────────── */
.gift-spot {
  position: absolute;
  z-index: 2;
  bottom: 2px;
  width: 64px;
  height: 64px;
  margin-left: -32px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  animation: gift-drop 0.75s cubic-bezier(0.3, 0, 0.6, 1) both;
  -webkit-tap-highlight-color: transparent;
}

.gift-spot:disabled {
  cursor: default;
}

/* Сдвигом не подсветить: transform держит анимация падения. */
.gift-spot:not(:disabled):hover {
  filter: brightness(1.12);
}

.gift-spot:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  border-radius: var(--radius-md);
}

/* С ветки — вниз, удар о снег и маленький отскок. */
@keyframes gift-drop {
  0% {
    opacity: 0;
    transform: translateY(-190px) rotate(-14deg);
  }
  12% {
    opacity: 1;
  }
  62% {
    transform: translateY(0) rotate(4deg);
  }
  78% {
    transform: translateY(-14px) rotate(-2deg);
  }
  100% {
    transform: translateY(0) rotate(0);
  }
}

/* Слово из подарка — светящийся ярлык. Обычное — снежное, с холодным
   светом; золотое — золото с тёплым сиянием и бликом: редкое видно сразу. */
.gift-word {
  position: relative;
  display: inline-block;
  padding: 4px 12px 5px;
  border: 1px solid rgba(255, 255, 255, 0.95);
  border-radius: var(--radius-pill);
  background: linear-gradient(180deg, #ffffff 0%, #dcebf7 100%);
  box-shadow:
    0 0 10px rgba(200, 230, 255, 0.9),
    0 0 26px rgba(150, 205, 245, 0.45),
    inset 0 -2px 0 rgba(90, 130, 170, 0.25);
  font-family: var(--font-title);
  font-weight: 700;
  font-size: 15px;
  color: #6d1a26;
  white-space: nowrap;
}

/* Слово с редкостью — ярлык её цвета (--tier) с сильным сиянием и бликом. */
.gift-word.is-rare {
  border-color: color-mix(in srgb, var(--tier) 40%, white);
  background:
    linear-gradient(
        105deg,
        transparent 35%,
        rgba(255, 255, 255, 0.9) 50%,
        transparent 65%
      ) -160%
      0 / 250% 100% no-repeat,
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tier) 30%, white) 0%,
      var(--tier) 100%
    );
  box-shadow:
    0 0 14px var(--tier),
    0 0 40px color-mix(in srgb, var(--tier) 70%, transparent),
    inset 0 -2px 0 rgba(0, 0, 0, 0.2);
  color: #3a1406;
}

/* Подпись редкости над словом: цвет одним не все отличат. */
.gift-word-tag {
  position: absolute;
  left: 50%;
  bottom: 100%;
  translate: -50% -3px;
  font-family: var(--font-body);
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--tier) 60%, white);
  text-shadow:
    0 0 6px rgba(255, 200, 60, 0.9),
    0 1px 2px rgba(0, 0, 0, 0.6);
}

/* Блик по золотому — светлой полосой в фоне, один раз. */
@keyframes word-shine {
  to {
    background-position:
      160% 0,
      0 0;
  }
}

/* Слово над подарком: по центру коробки — свойством translate, чтобы
   transform остался анимации появления. */
.gift-spot .gift-word {
  position: absolute;
  z-index: 3;
  bottom: calc(100% + 6px);
  left: 50%;
  translate: -50% 0;
  pointer-events: none;
  animation: word-pop 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.4) both;
}

.gift-spot .gift-word.is-rare {
  animation:
    word-pop 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.4) both,
    word-shine 0.9s ease 0.35s forwards;
}

.gift-spot .gift-word.is-high {
  bottom: calc(100% + 44px);
}

.gift-spot .gift-word.is-small {
  padding: 3px 10px 4px;
  font-size: 13.5px;
}

@keyframes word-pop {
  0% {
    opacity: 0;
    transform: translateY(14px) scale(0.6);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

/* ── Кот ───────────────────────────────────── */
/* Сценка в 2 секунды поверх ёлки: выглянул (0–1 с), сорвался и упал
   (0,95–1,5 с), удрал вправо (1,5–1,9 с). Каждая поза — своя картинка со
   своей задержкой; до начала она невидима. Только transform и opacity, кроме
   падения: там top — один элемент на полсекунды. */
.cat {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
}

.cat > * {
  position: absolute;
  display: block;
}

.cat-peek {
  left: 50%;
  top: 26%;
  width: 46%;
  height: auto;
  translate: -50% 0;
  animation: cat-peek 1s ease-out both;
}

@keyframes cat-peek {
  0% {
    opacity: 0;
    transform: translateY(24px) scale(0.8);
  }
  22% {
    opacity: 1;
    transform: none;
  }
  52% {
    transform: none;
  }
  58% {
    transform: rotate(-5deg);
  }
  64% {
    transform: rotate(5deg);
  }
  70% {
    transform: none;
  }
  94% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(8px);
  }
}

.cat-fall {
  left: 50%;
  top: 26%;
  width: 44%;
  height: auto;
  translate: -50% 0;
  animation: cat-fall 0.55s cubic-bezier(0.55, 0, 1, 0.6) 0.95s both;
}

@keyframes cat-fall {
  0% {
    opacity: 0;
    top: 26%;
    transform: rotate(0);
  }
  1% {
    opacity: 1;
  }
  96% {
    opacity: 1;
    top: 68%;
    transform: rotate(170deg);
  }
  100% {
    opacity: 0;
    top: 68%;
    transform: rotate(180deg);
  }
}

/* Крик — системной строкой из книги, в скобках. */
.cat-meow {
  left: 56%;
  top: 14%;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: #fff3dc;
  white-space: nowrap;
  text-shadow:
    0 0 10px rgba(255, 214, 150, 0.9),
    0 0 24px rgba(255, 190, 90, 0.5);
  animation: cat-meow 0.9s ease-out 0.95s both;
}

@keyframes cat-meow {
  0% {
    opacity: 0;
    transform: scale(0.4) rotate(-8deg);
  }
  20% {
    opacity: 1;
    transform: scale(1.15) rotate(-4deg);
  }
  35% {
    transform: scale(1) rotate(-6deg);
  }
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-14px) rotate(-6deg);
  }
}

/* Снег из-под лап, когда шлёпнулся. */
.cat-puff {
  left: 38%;
  bottom: 2%;
  width: 84px;
  height: 30px;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    rgba(255, 255, 255, 0.95),
    rgba(220, 235, 250, 0.5) 60%,
    transparent
  );
  animation: cat-puff 0.5s ease-out 1.45s both;
}

@keyframes cat-puff {
  0% {
    opacity: 0;
    transform: scale(0.3);
  }
  30% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: scale(1.8) translateY(-6px);
  }
}

/* Молния: полосы скорости вспыхивают позади кота и гаснут. */
.cat-trail {
  left: -12%;
  right: 46%;
  bottom: 10%;
  height: 24px;
  background:
    linear-gradient(90deg, transparent, rgba(255, 244, 190, 0.95)) 0 2px / 100%
      2px no-repeat,
    linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.9)) 100% 11px /
      86% 3px no-repeat,
    linear-gradient(90deg, transparent, rgba(255, 244, 190, 0.85)) 100% 20px /
      90% 2px no-repeat;
  filter: drop-shadow(0 0 4px rgba(255, 230, 150, 0.9));
  /* Полосы — позади кота: растут от того места, где он стоял, назад. */
  transform-origin: right center;
  animation: cat-trail 0.6s ease-out 1.55s both;
}

@keyframes cat-trail {
  0% {
    opacity: 0;
    transform: scaleX(0);
  }
  35% {
    opacity: 1;
    transform: scaleX(1);
  }
  100% {
    opacity: 0;
    transform: scaleX(1);
  }
}

.cat-run {
  left: 26%;
  bottom: 3%;
  width: 50%;
  height: auto;
  animation: cat-run 0.4s cubic-bezier(0.7, 0, 1, 1) 1.5s both;
}

@keyframes cat-run {
  0% {
    opacity: 0;
    transform: none;
  }
  1% {
    opacity: 1;
    transform: scaleX(0.92);
  }
  25% {
    transform: translateX(-5%) scaleX(0.9);
  }
  100% {
    opacity: 1;
    transform: translateX(260%) skewX(-14deg);
  }
}

/* ── Удары и подсказка ─────────────────────── */
.hits {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin: 10px 0 2px;
}

.hit-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1px solid rgba(241, 230, 210, 0.4);
  transition:
    background 0.2s,
    border-color 0.2s;
}

.hit-dot.on {
  background: #f1c444;
  border-color: #f1c444;
}

.tree-hint {
  min-height: 1.4em;
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--text-muted);
}

/* ── Итог ──────────────────────────────────── */
.result {
  padding: 8px 0 0;
  animation: result-in 0.5s ease both;
}

@keyframes result-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

.result-note {
  margin: 14px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: rgba(241, 230, 210, 0.78);
}

.result .btn--lg {
  margin-top: 16px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 18px;
}

.tree-err {
  margin: 16px 0 0;
  font-size: 14px;
  color: var(--danger);
}

@media (prefers-reduced-motion: reduce) {
  .scene-snow {
    animation: none;
  }

  .tree-sway {
    animation-duration: 0.01s;
  }

  .gift-spot {
    animation-duration: 0.01s;
  }

  .gift-spot .gift-word.is-rare {
    animation: none;
  }
}
</style>

<!-- Ключевые кадры качания — без scoped: имя анимации приходит из style. -->
<style>
@keyframes tree-sway-a {
  0% {
    transform: rotate(0);
  }
  15% {
    transform: rotate(calc(var(--amp) * -1));
  }
  35% {
    transform: rotate(calc(var(--amp) * 0.75));
  }
  55% {
    transform: rotate(calc(var(--amp) * -0.45));
  }
  75% {
    transform: rotate(calc(var(--amp) * 0.2));
  }
  100% {
    transform: rotate(0);
  }
}

@keyframes tree-sway-b {
  0% {
    transform: rotate(0);
  }
  15% {
    transform: rotate(calc(var(--amp) * -1));
  }
  35% {
    transform: rotate(calc(var(--amp) * 0.75));
  }
  55% {
    transform: rotate(calc(var(--amp) * -0.45));
  }
  75% {
    transform: rotate(calc(var(--amp) * 0.2));
  }
  100% {
    transform: rotate(0);
  }
}
</style>
