/**
 * Лабиринт в «ночной метели»: как рисуется поле. Здесь только кисти — что
 * видно и где фишка, решает MazeBoard.
 *
 * Ночь тёмно-синяя, пройденное — утоптанный снег, стены — сугробы. Фонарь у
 * фишки тёплый: на холодном поле по нему сразу видно, где ты. След — отпечатки
 * шагов, старые заметает. Выход — окошко таверны: дойти из метели до тепла.
 *
 * Случайность в неподвижном (крапинки снега, искры у фонаря) — от номера, а не
 * от Math.random: иначе каждый кадр всё бы мерцало.
 */

/** Число в [0, 1) от пары чисел — одно и то же для одной пары. */
export function hash01(a: number, b = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 1, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const WINTER = {
  nightTop: "#0e1726",
  nightBottom: "#080d16",
  snow: "#2c3a4c",
  speck: "255, 255, 255",
  print: "6, 12, 22",
  printRim: "220, 235, 250",
  wallNear: "#eef5fc",
  wallFar: "rgba(170, 195, 222, 0.38)",
  wallDone: "rgba(214, 228, 244, 0.62)",
  wallShadow: "20, 40, 70",
  lantern: "255, 186, 110",
  token: "#f2a65a",
  tokenCore: "#fff2dc",
  flake: "235, 244, 252",
} as const;

type Xy = (i: number) => readonly [number, number];

/** Ночь под всем полем. */
export function drawNight(g: CanvasRenderingContext2D, side: number) {
  const night = g.createLinearGradient(0, 0, 0, side);
  night.addColorStop(0, WINTER.nightTop);
  night.addColorStop(1, WINTER.nightBottom);
  g.fillStyle = night;
  g.fillRect(0, 0, side, side);
}

/**
 * Снег под ногами и следы — то, что меняется только с шагом: рисуется в
 * отдельный слой и пересобирается, когда открылись клетки или стало больше
 * шагов. Следы бледнеют с каждым шагом после них — их заметает; на финише
 * весь путь виден одинаково.
 */
export function drawGround(
  g: CanvasRenderingContext2D,
  o: {
    cs: number;
    floor: Path2D;
    cells: Iterable<number>;
    path: readonly number[];
    xy: Xy;
    done: boolean;
  },
) {
  const { cs, xy } = o;
  g.fillStyle = WINTER.snow;
  g.fill(o.floor);

  const speck = Math.max(1, cs * 0.035);
  for (const c of o.cells) {
    const [x, y] = xy(c);
    for (let k = 0; k < 4; k++) {
      g.fillStyle = `rgba(${WINTER.speck}, ${0.03 + hash01(c, k * 3) * 0.06})`;
      g.fillRect(
        (x + hash01(c, k * 3 + 1)) * cs,
        (y + hash01(c, k * 3 + 2)) * cs,
        speck,
        speck,
      );
    }
  }

  const len = o.path.length;
  const rx = Math.max(1.6, cs * 0.1);
  const ry = Math.max(1, cs * 0.06);
  const off = cs * 0.1;
  for (let i = 1; i < len; i++) {
    const [ax, ay] = xy(o.path[i - 1]!);
    const [bx, by] = xy(o.path[i]!);
    const dx = bx - ax;
    const dy = by - ay;
    const age = len - 1 - i;
    const alpha = o.done ? 0.5 : Math.max(0.16, 0.62 - age * 0.004);
    const angle = Math.atan2(dy, dx);
    for (const [t, side] of [
      [0.3, 1],
      [0.8, -1],
    ] as const) {
      const fx = (ax + 0.5 + dx * t) * cs - dy * side * off;
      const fy = (ay + 0.5 + dy * t) * cs + dx * side * off;
      g.save();
      g.translate(fx, fy);
      g.rotate(angle);
      g.fillStyle = `rgba(${WINTER.print}, ${alpha})`;
      g.beginPath();
      g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(${WINTER.printRim}, ${alpha * 0.25})`;
      g.beginPath();
      g.ellipse(rx * 0.2, -ry * 0.5, rx * 0.8, ry * 0.35, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
}

/** Тёплый свет фонаря — только по снегу, в темноту он не светит. */
export function drawLantern(
  g: CanvasRenderingContext2D,
  floor: Path2D,
  px: number,
  py: number,
  radius: number,
) {
  const glow = g.createRadialGradient(px, py, 0, px, py, radius);
  glow.addColorStop(0, `rgba(${WINTER.lantern}, 0.55)`);
  glow.addColorStop(0.5, `rgba(${WINTER.lantern}, 0.18)`);
  glow.addColorStop(1, `rgba(${WINTER.lantern}, 0)`);
  g.save();
  g.clip(floor);
  g.fillStyle = glow;
  g.fillRect(px - radius, py - radius, radius * 2, radius * 2);
  g.restore();
}

/** Сугробы: у фонаря — белые, с тенью снизу и бликом сверху; дальше —
 *  бледные. На финише весь пройденный лабиринт ровный и светлый. */
export function drawDrifts(
  g: CanvasRenderingContext2D,
  near: Path2D,
  far: Path2D,
  cs: number,
  done: boolean,
) {
  g.lineCap = "round";
  g.lineJoin = "round";
  g.save();
  g.translate(0, Math.max(1, cs * 0.045));
  g.lineWidth = Math.max(2.4, cs * 0.24);
  g.strokeStyle = `rgba(${WINTER.wallShadow}, 0.75)`;
  g.stroke(near);
  g.strokeStyle = `rgba(${WINTER.wallShadow}, 0.4)`;
  g.stroke(far);
  g.restore();

  g.lineWidth = Math.max(2, cs * 0.18);
  g.strokeStyle = done ? WINTER.wallDone : WINTER.wallFar;
  g.stroke(far);
  g.lineWidth = Math.max(2, cs * 0.2);
  g.strokeStyle = WINTER.wallNear;
  g.stroke(near);
  g.save();
  g.translate(0, -Math.max(0.8, cs * 0.035));
  g.lineWidth = Math.max(0.8, cs * 0.07);
  g.strokeStyle = "rgba(255, 255, 255, 0.9)";
  g.stroke(near);
  g.restore();
}

/** Искры инея в свете фонаря — мерцают и медленно кружат. */
export function drawFrostSparks(
  g: CanvasRenderingContext2D,
  px: number,
  py: number,
  cs: number,
  now: number,
) {
  const size = Math.max(1.2, cs * 0.045);
  for (let i = 0; i < 22; i++) {
    const a = hash01(i, 1) * Math.PI * 2 + now * 0.00025 * (hash01(i, 2) - 0.5);
    const r = (0.4 + hash01(i, 3) * 2.2) * cs;
    const twinkle =
      0.5 + 0.5 * Math.sin(now / (260 + hash01(i, 4) * 300) + i * 1.7);
    g.fillStyle = `rgba(255, 240, 215, ${0.2 + twinkle * 0.6})`;
    g.fillRect(px + Math.cos(a) * r, py + Math.sin(a) * r, size, size);
  }
}

/** Выход — окошко таверны с тёплым светом и деревянным подоконником. Свет
 *  чуть дышит, как огонь за стеклом. */
export function drawInnWindow(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cs: number,
  now: number,
) {
  const breathe = 0.5 + 0.5 * Math.sin(now / 520);
  const gr = cs * (1.7 + 0.25 * breathe);
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, gr);
  glow.addColorStop(0, "rgba(255, 196, 110, 0.85)");
  glow.addColorStop(0.4, "rgba(255, 170, 80, 0.3)");
  glow.addColorStop(1, "rgba(255, 170, 80, 0)");
  g.fillStyle = glow;
  g.fillRect(cx - gr, cy - gr, gr * 2, gr * 2);

  const w = Math.max(7, cs * 0.56);
  const h = Math.max(8, cs * 0.62);
  const fr = Math.max(1.5, cs * 0.08);
  g.fillStyle = "#4a2f1a";
  g.fillRect(cx - w / 2 - fr, cy - h / 2 - fr, w + fr * 2, h + fr * 2);
  const glass = g.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  glass.addColorStop(0, "#ffe3a3");
  glass.addColorStop(1, "#ffb457");
  g.fillStyle = glass;
  g.fillRect(cx - w / 2, cy - h / 2, w, h);
  const bar = Math.max(1, cs * 0.065);
  g.fillStyle = "#4a2f1a";
  g.fillRect(cx - bar / 2, cy - h / 2, bar, h);
  g.fillRect(cx - w / 2, cy - bar / 2, w, bar);
  // Подоконник деревянный, в цвет рамы: белый, со снегом, читался как полоска
  // дорожки и сбивал на последних шагах.
  const sill = Math.max(2.5, cs * 0.14);
  g.fillStyle = "#4a2f1a";
  g.beginPath();
  g.roundRect(
    cx - w / 2 - fr - cs * 0.08,
    cy + h / 2 + fr * 0.4,
    w + fr * 2 + cs * 0.16,
    sill,
    sill / 2,
  );
  g.fill();
}

/** Фишка — огонёк фонаря. */
export function drawToken(
  g: CanvasRenderingContext2D,
  px: number,
  py: number,
  cs: number,
) {
  const r = Math.max(3, cs * 0.3);
  g.save();
  g.shadowColor = "rgba(255, 170, 90, 0.95)";
  g.shadowBlur = cs * 0.7;
  g.fillStyle = WINTER.token;
  g.beginPath();
  g.arc(px, py, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.fillStyle = WINTER.tokenCore;
  g.beginPath();
  g.arc(px, py, r * 0.4, 0, Math.PI * 2);
  g.fill();
}

// ── Метель ────────────────────────────────────────────────────────────────

/** Снежинка: положение — в долях поля, скорость — долей в секунду. */
export type Flake = {
  x: number;
  y: number;
  r: number;
  vy: number;
  sway: number;
  freq: number;
  phase: number;
  alpha: number;
  /** Над пройденным такие не рисуются: в темноте метель гуще, у фонаря реже. */
  thin: boolean;
};

/** Порывы ветра — косые штрихи, быстрее снежинок. */
export type Gust = { x: number; y: number; v: number };

const WIND = 0.035;

export function makeSnow(count: number): { flakes: Flake[]; gusts: Gust[] } {
  const flakes = Array.from({ length: count }, () => {
    const r = 0.5 + Math.random() * Math.random() * 2.2;
    return {
      x: Math.random(),
      y: Math.random(),
      r,
      vy: 0.035 + r * 0.03 + Math.random() * 0.02,
      sway: 0.01 + Math.random() * 0.02,
      freq: 0.0006 + Math.random() * 0.0012,
      phase: Math.random() * Math.PI * 2,
      alpha: Math.random(),
      thin: Math.random() < 0.55,
    };
  });
  const gusts = Array.from({ length: 18 }, () => ({
    x: Math.random(),
    y: Math.random(),
    v: 0.25 + Math.random() * 0.2,
  }));
  return { flakes, gusts };
}

const wrap01 = (v: number) => ((v % 1) + 1) % 1;

export function stepSnow(
  snow: { flakes: Flake[]; gusts: Gust[] },
  dt: number,
  now: number,
) {
  for (const f of snow.flakes) {
    f.y = wrap01(f.y + f.vy * dt);
    f.x = wrap01(f.x + (WIND + Math.sin(now * f.freq + f.phase) * f.sway) * dt);
  }
  for (const s of snow.gusts) {
    s.x = wrap01(s.x - s.v * dt);
    s.y = wrap01(s.y + s.v * 0.42 * dt);
  }
}

export function drawSnow(
  g: CanvasRenderingContext2D,
  snow: { flakes: Flake[]; gusts: Gust[] },
  side: number,
  onFloor: (x: number, y: number) => boolean,
) {
  const scale = Math.max(0.7, side / 540);
  for (const f of snow.flakes) {
    const lit = onFloor(f.x, f.y);
    if (lit && f.thin) continue;
    g.fillStyle = `rgba(${WINTER.flake}, ${(lit ? 0.35 : 0.5) + f.alpha * 0.4})`;
    g.beginPath();
    g.arc(f.x * side, f.y * side, f.r * scale, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = `rgba(${WINTER.flake}, 0.1)`;
  g.lineWidth = 1;
  g.beginPath();
  for (const s of snow.gusts) {
    g.moveTo(s.x * side, s.y * side);
    g.lineTo(s.x * side - 14 * scale, s.y * side + 6 * scale);
  }
  g.stroke();
}

// ── Финиш ─────────────────────────────────────────────────────────────────

export type Burst = {
  t0: number;
  x: number;
  y: number;
  bits: {
    angle: number;
    speed: number;
    size: number;
    spin: number;
    delay: number;
  }[];
};

export const BURST_MS = 2600;

/** Снежинки разлетаются от окошка к середине поля — выход бывает в любом
 *  углу, и наружу им лететь некуда. */
export function makeBurst(
  x: number,
  y: number,
  side: number,
  cs: number,
  now: number,
): Burst {
  const toCenter = Math.atan2(side / 2 - y, side / 2 - x);
  return {
    t0: now,
    x,
    y,
    bits: Array.from({ length: 24 }, () => ({
      angle: toCenter + (Math.random() - 0.5) * 2.2,
      speed: cs * (1 + Math.random() * 3.4),
      size: Math.max(8, cs * (0.3 + Math.random() * 0.5)),
      spin: (Math.random() - 0.5) * 3,
      delay: Math.random() * 350,
    })),
  };
}

/** false — снежинки отлетали. */
export function drawBurst(
  g: CanvasRenderingContext2D,
  b: Burst,
  now: number,
  flake: HTMLImageElement,
): boolean {
  let alive = false;
  for (const bit of b.bits) {
    const t = (now - b.t0 - bit.delay) / BURST_MS;
    if (t > 1) continue;
    alive = true;
    if (t < 0) continue;
    const ease = 1 - (1 - t) ** 3;
    const x = b.x + Math.cos(bit.angle) * bit.speed * ease;
    const y = b.y + Math.sin(bit.angle) * bit.speed * ease - t * bit.size;
    g.save();
    g.globalAlpha = 1 - t * t;
    g.translate(x, y);
    g.rotate(bit.spin * t);
    g.shadowColor = "rgba(160, 215, 255, 0.9)";
    g.shadowBlur = 6;
    g.drawImage(flake, -bit.size / 2, -bit.size / 2, bit.size, bit.size);
    g.restore();
  }
  return alive;
}
