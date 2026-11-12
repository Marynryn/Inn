<script setup lang="ts">
/**
 * Снегопад на ночной картинке hero. Один canvas во весь hero; родителю нужен
 * position: relative. Снег не летит над оглавлением и в главе: на пергаменте
 * белое не видно, а над текстом мельтешение мешает читать.
 *
 * Рисует только пока hero на экране и вкладка открыта. При системной
 * настройке «уменьшить движение» не запускается вовсе — canvas остаётся пустым.
 */
const canvas = ref<HTMLCanvasElement | null>(null);

type Flake = {
  x: number;
  y: number;
  /** радиус — им же задаётся глубина: крупные ближе и падают быстрее */
  r: number;
  vy: number;
  sway: number;
  freq: number;
  phase: number;
  alpha: number;
};

/** Плотность: одна снежинка на столько квадратных пикселей — лёгкий снег. */
const AREA_PER_FLAKE = 8800;
const MIN_FLAKES = 32;
const MAX_FLAKES = 140;
/** Чуть сносит вправо: снег, падающий строго вниз, выглядит нарисованным. */
const WIND = 0.05;

let stop: (() => void) | null = null;

onMounted(() => {
  const el = canvas.value;
  const ctx = el?.getContext("2d");
  if (!el || !ctx) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Снежинка — мягкое пятно: рисуем его один раз и дальше только штампуем.
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 32;
  const sctx = sprite.getContext("2d")!;
  const glow = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(0.38, "rgba(255,255,255,.85)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  sctx.fillStyle = glow;
  sctx.fillRect(0, 0, 32, 32);

  let w = 0;
  let h = 0;
  let flakes: Flake[] = [];

  const spawn = (anywhere: boolean): Flake => {
    const r = 0.7 + Math.random() ** 2.2 * 2.3;
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -6 - Math.random() * 30,
      r,
      vy: (0.32 + r * 0.3) * 0.75,
      sway: 0.3 + Math.random() * 0.9,
      freq: 0.01 + Math.random() * 0.02,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.5 + Math.random() * 0.5,
    };
  };

  const resize = () => {
    const box = el.getBoundingClientRect();
    w = box.width;
    h = box.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const want = Math.round(
      Math.min(MAX_FLAKES, Math.max(MIN_FLAKES, (w * h) / AREA_PER_FLAKE)),
    );
    while (flakes.length < want) flakes.push(spawn(true));
    flakes = flakes.slice(0, want);
  };

  let raf = 0;
  let last = 0;
  let onScreen = false;

  const frame = (t: number) => {
    raf = requestAnimationFrame(frame);
    // Шаг по времени, а не по кадрам: на 120 Гц снег не падает вдвое быстрее.
    const k = Math.min(50, t - (last || t)) / 16.67;
    last = t;
    ctx.clearRect(0, 0, w, h);
    for (const p of flakes) {
      p.phase += p.freq * 3 * k;
      p.y += p.vy * k;
      p.x +=
        (Math.sin(p.phase) * p.sway * 0.45 + WIND * (0.35 + p.r * 0.3)) * k;
      if (p.y > h + 8) Object.assign(p, spawn(false));
      else if (p.x > w + 10) p.x = -8;
      else if (p.x < -10) p.x = w + 8;
      const s = p.r * 4.2;
      ctx.globalAlpha = p.alpha;
      ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  };

  const play = () => {
    if (raf || !onScreen || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const pause = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const io = new IntersectionObserver(([entry]) => {
    onScreen = !!entry?.isIntersecting;
    if (onScreen) play();
    else pause();
  });
  const ro = new ResizeObserver(resize);
  const onVisibility = () => (document.hidden ? pause() : play());

  resize();
  io.observe(el);
  ro.observe(el);
  document.addEventListener("visibilitychange", onVisibility);

  stop = () => {
    pause();
    io.disconnect();
    ro.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
  };
});

onBeforeUnmount(() => stop?.());
</script>

<template>
  <canvas ref="canvas" class="snowfall" aria-hidden="true" />
</template>

<style scoped>
.snowfall {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
