/**
 * Рисует зимнее оформление сайта: сосульки, снежные кромки, снег на вывеске,
 * снежинки — всё в app/assets/winter/*.svg.
 *
 *   node scripts/winter-art.mjs
 *
 * Картинки получаются одинаковыми при каждом запуске: случайность здесь с
 * затравкой. Перезапускать стоит, если поменялась вывеска
 * (public/sign-characters.webp) — снег на ней кладётся по её верхнему краю,
 * снятому с самой картинки, — или если хочется подправить форму снега.
 *
 * Полосы, которые тянутся на всю ширину (сосульки, снег по краю hero, снег на
 * плашках), нарисованы плитками, которые стыкуются сами с собой: неровности
 * края — сумма синусов с целым числом волн на плитку. Тогда CSS повторяет
 * плитку по ширине, и шва не видно ни на телефоне, ни на широком мониторе.
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const OUT = "app/assets/winter";
const SIGN = "public/sign-characters.webp";

const f = (n) => String(Math.round(n * 10) / 10);

/** Повторяемый «случай»: одна и та же затравка — одна и та же картинка. */
function rng(seed) {
  let s = (seed * 9301 + 49297) >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Плавная замкнутая кривая через точки (Катмулл — Ром в кубические Безье). */
function closedCurve(pts) {
  const n = pts.length;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d +=
      `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ` +
      `${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ` +
      `${f(p2[0])},${f(p2[1])}`;
  }
  return d + "Z";
}

/** Сумма синусов с целым числом волн на ширину w — край стыкуется сам с собой. */
function waves(w, seed, terms) {
  const r = rng(seed);
  const t = terms.map(([amp, cycles]) => [amp, cycles, r() * Math.PI * 2]);
  return (x) =>
    t.reduce(
      (s, [a, m, ph]) => s + a * Math.sin((2 * Math.PI * m * x) / w + ph),
      0,
    );
}

const svg = (w, h, defs, body, viewBox = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}"><defs>${defs}</defs>${body}</svg>\n`;

// Снег: белый сверху, с голубоватой тенью снизу — так он читается и на
// тёмной картинке, и на пергаменте.
const SNOW = `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#f7fafc"/><stop offset="1" stop-color="#d9e5ee"/></linearGradient>`;
const ICE = `<linearGradient id="i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".97"/><stop offset=".55" stop-color="#d7e9f5" stop-opacity=".85"/><stop offset="1" stop-color="#a9cbe2" stop-opacity=".55"/></linearGradient>`;

/** Сосульки: [x, длина, толщина у основания], корни на линии y0. */
function icicles(list, y0 = 0) {
  let body = "";
  let glint = "";
  for (const [x, len, w] of list) {
    body +=
      `M${f(x - w / 2)},${f(y0)}` +
      `C${f(x - w / 2)},${f(y0 + len * 0.35)} ${f(x - 0.5)},${f(y0 + len * 0.82)} ${f(x)},${f(y0 + len)}` +
      `C${f(x + 0.5)},${f(y0 + len * 0.82)} ${f(x + w / 2)},${f(y0 + len * 0.35)} ${f(x + w / 2)},${f(y0)}Z`;
    glint += `M${f(x - w / 4)},${f(y0 + 1)}L${f(x - 0.3)},${f(y0 + len * 0.6)}`;
  }
  return (
    `<path d="${body}" fill="url(#i)" stroke="#6e91aa" stroke-opacity=".55" stroke-width=".5"/>` +
    `<path d="${glint}" stroke="#fff" stroke-width=".7" stroke-linecap="round" opacity=".85" fill="none"/>`
  );
}

/** Сосульки по ширине плитки w: ни одна не режется краем плитки. */
function iciclesRow(w, seed, { gap, len, thick }) {
  const r = rng(seed);
  const list = [];
  for (let x = 6 + r() * 8; x < w - 6; x += gap[0] + r() * (gap[1] - gap[0])) {
    // Длинные идут редко: так ряд выглядит наросшим, а не нарезанным гребёнкой.
    const long = r() < 0.22;
    const l = long
      ? len[1] * (0.75 + r() * 0.25)
      : len[0] + r() * (len[1] - len[0]) * 0.55;
    list.push([x, l, thick[0] + r() * (thick[1] - thick[0])]);
  }
  return list;
}

/**
 * Снег, лежащий на горизонтальной кромке y = edge: сверху бугристый, снизу
 * чуть свисает за кромку. Плитка шириной w.
 */
function ledge(w, seed, { edge, base, amp, drip, cycles }) {
  const top = waves(w, seed, [
    [0.5, cycles[0]],
    [0.3, cycles[1]],
    [0.18, cycles[2]],
  ]);
  const env = waves(w, seed + 1, [[0.45, cycles[3]]]);
  const hang = waves(w, seed + 2, [
    [1, cycles[1] + 3],
    [0.6, cycles[2] + 5],
  ]);
  // Шаг мельче самой короткой волны, иначе кривая ломается в зубцы.
  const step = 6;
  const up = [];
  const down = [];
  for (let x = -step * 2; x <= w + step * 2; x += step) {
    const h = base + amp * Math.max(0, 0.5 + top(x)) * (0.55 + env(x));
    up.push([x, edge - h]);
    down.push([x, edge + 0.6 + drip * Math.max(0, hang(x)) ** 3]);
  }
  return closedCurve([...up, ...down.reverse()]);
}

const files = {};

// ── Сосульки по верху hero ─────────────────────────────────────────────────
// Кромка снега, с которой они свисают: верх уходит за край страницы.
{
  const w = 1201;
  const h = 9;
  const bottom = waves(w, 7, [
    [0.3, 41],
    [0.2, 71],
    [0.15, 19],
  ]);
  const step = 8;
  const pts = [
    [-20, -4],
    [w + 20, -4],
  ];
  const under = [];
  for (let x = w + step * 2; x >= -step * 2; x -= step)
    under.push([x, 1.6 + 3.6 * Math.max(0, 0.5 + bottom(x))]);
  files["icicles-band.svg"] = svg(
    w,
    h,
    SNOW,
    `<path d="${closedCurve([...pts, ...under])}" fill="url(#s)"/>`,
  );
}
// Длинные — там, где в шапке ничего нет; короткие — над логотипом и кнопками,
// чтобы ничего не закрывали. Корни на 2px ниже края — под снежной кромкой.
files["icicles-long.svg"] = svg(
  997,
  34,
  ICE,
  icicles(
    iciclesRow(997, 3, { gap: [7, 24], len: [6, 28], thick: [2.8, 5.8] }),
    2,
  ),
);
files["icicles-short.svg"] = svg(
  331,
  12,
  ICE,
  icicles(
    iciclesRow(331, 5, { gap: [8, 22], len: [3, 9], thick: [2.4, 4.4] }),
    2,
  ),
);

// ── Снег по нижнему краю hero ──────────────────────────────────────────────
// Кромка — на 16px от верха плитки: выше неё снег лежит на картинке, ниже
// чуть свисает на пергамент.
files["snow-ledge.svg"] = svg(
  1409,
  24,
  SNOW,
  `<path d="${ledge(1409, 21, { edge: 16, base: 4, amp: 9, drip: 2.6, cycles: [13, 31, 67, 4] })}" fill="url(#s)"/>`,
);

// ── Снег на плашках («Кто из таверны?», телеграм) ─────────────────────────
// Середина — плитка; к правому углу снега больше, он свисает за угол; у левого
// угла — маленький наплыв. Кромка плашки в плитке на y = 7.
{
  const w = 613;
  const edge = 7;
  const r = rng(11);
  const list = [];
  for (let x = 20 + r() * 30; x < w - 10; x += 38 + r() * 80)
    list.push([x, 3 + r() * 6, 2.4 + r() * 2.4]);
  files["snow-card.svg"] = svg(
    w,
    19,
    SNOW + ICE,
    icicles(list, edge) +
      `<path d="${ledge(w, 13, { edge, base: 2, amp: 3.6, drip: 2, cycles: [7, 19, 37, 3] })}" fill="url(#s)"/>`,
  );
}
{
  // Правый угол: плитка 124×30, кромка на y = 14, угол плашки на x = 120.
  const edge = 14;
  const corner = 120;
  const up = [];
  for (let x = -4; x <= 112; x += 6) {
    const h =
      3 + 10.5 * Math.exp(-(((x - 90) / 24) ** 2)) + 0.8 * Math.sin(x * 0.45);
    up.push([x, edge - h]);
  }
  const pts = [
    ...up,
    [corner - 3, edge - 8.5],
    [corner + 1.5, edge - 4.5],
    [corner + 3.6, edge + 0.5],
    [corner + 3, edge + 6],
    [corner + 1, edge + 9],
    [corner - 1.5, edge + 6.5],
    [corner - 5, edge + 2.6],
    [corner - 14, edge + 3.4],
    [corner - 24, edge + 1.4],
    [corner - 40, edge + 2.2],
    [corner - 60, edge + 0.9],
    [corner - 90, edge + 1.2],
    [-4, edge + 0.8],
  ];
  files["snow-card-right.svg"] = svg(
    124,
    30,
    SNOW + ICE,
    icicles(
      [
        [70, 7, 3.4],
        [84, 11, 4.4],
        [97, 6, 3],
        [108, 9, 3.6],
      ],
      edge,
    ) + `<path d="${closedCurve(pts)}" fill="url(#s)"/>`,
  );
}
{
  // Левый угол: плитка 44×24, кромка на y = 12, угол плашки на x = 4.
  const edge = 12;
  const pts = [
    [2.6, edge + 6.5],
    [0.4, edge + 2.5],
    [1.5, edge - 2.5],
    [6, edge - 5],
    [14, edge - 4.6],
    [24, edge - 3.2],
    [34, edge - 3.8],
    [46, edge - 3],
    [46, edge + 1],
    [30, edge + 1.2],
    [16, edge + 2],
    [8, edge + 3.4],
    [5, edge + 6],
  ];
  files["snow-card-left.svg"] = svg(
    44,
    24,
    SNOW,
    `<path d="${closedCurve(pts)}" fill="url(#s)"/>`,
  );
}

// ── Снег на вывеске «Карточки персонажей» ─────────────────────────────────
// Верх доски — дугой: снимаем его с картинки по столбцам, ищем первый
// непрозрачный «деревянный» пиксель (рыжий, не серый металл цепей). Под
// скобами, где цепь крепится к доске, снег не рисуем: скоба впереди доски и
// должна торчать из снега, а не тонуть в нём.
{
  const { data, info } = await sharp(SIGN)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  if (W !== 520 || H !== 650)
    console.warn(`вывеска ${W}×${H}, а снег рассчитан на 520×650 — проверь`);
  const at = (x, y) => {
    const i = (y * W + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const isWood = ([r, g, b, a]) => a > 200 && r - b > 28 && r > 70;
  const topOf = (x) => {
    for (let y = 250; y < 460; y++) if (isWood(at(x, y))) return y;
    return null;
  };

  // Скобы и цепи — по столбцам, где много серого металла.
  const PLATES = [
    [80, 117],
    [404, 439],
  ];
  const X0 = 16;
  const X1 = 506;
  const raw = [];
  for (let x = X0; x <= X1; x += 4) {
    const inPlate = PLATES.some(([a, b]) => x >= a - 6 && x <= b + 6);
    raw.push([x, inPlate ? null : topOf(x)]);
  }
  // Пропуски (скобы) — по прямой между соседями, потом сглаживаем.
  for (let i = 0; i < raw.length; i++) {
    if (raw[i][1] != null) continue;
    let a = i - 1;
    let b = i + 1;
    while (b < raw.length && raw[b][1] == null) b++;
    const ya = raw[a][1];
    const yb = raw[b][1];
    for (let k = i; k < b; k++)
      raw[k][1] = ya + ((yb - ya) * (k - a)) / (b - a);
    i = b;
  }
  const smooth = raw.map(([x], i) => {
    const win = raw.slice(Math.max(0, i - 2), i + 3);
    return [x, win.reduce((s, p) => s + p[1], 0) / win.length];
  });
  const topAt = (x) => {
    const i = Math.min(
      smooth.length - 2,
      Math.max(0, Math.floor((x - X0) / 4)),
    );
    const [xa, ya] = smooth[i];
    const [xb, yb] = smooth[i + 1];
    return ya + ((yb - ya) * (x - xa)) / (xb - xa);
  };

  const r = rng(4);
  const bump = waves(1000, 9, [
    [0.3, 7],
    [0.22, 15],
    [0.12, 29],
  ]);
  /**
   * Кусок снега между x0 и x1; концы закруглены и опускаются к доске. Низ
   * снега на 11px ниже края: у доски видна светлая верхняя грань, и снег
   * должен лечь на неё целиком, иначе из-под него торчит дерево.
   */
  const piece = (x0, x1, height, droop) => {
    const up = [];
    const down = [];
    const n = Math.max(6, Math.round((x1 - x0) / 7));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const t = Math.min(1, (x - x0) / 14, (x1 - x) / 14);
      const h = height * (0.6 + 0.8 * Math.max(0, 0.5 + bump(x))) * t;
      up.push([x, topAt(x) - h]);
      const hang = 11 + 7 * Math.max(0, Math.sin(x * 0.07 + 1.3)) ** 4 * r();
      down.push([x, topAt(x) + hang * (0.5 + 0.5 * t)]);
    }
    up.unshift([x0 - droop[0], topAt(x0) + droop[1]]);
    up.push([x1 + droop[2], topAt(x1) + droop[3]]);
    return closedCurve([...up, ...down.reverse()]);
  };
  const body = [
    piece(X0, PLATES[0][0] - 2, 8, [9, 14, 1, 8]),
    piece(PLATES[0][1] + 2, PLATES[1][0] - 2, 9, [1, 8, 1, 8]),
    piece(PLATES[1][1] + 2, X1, 8, [1, 8, 10, 16]),
  ]
    .map((d) => `<path d="${d}" fill="url(#s)"/>`)
    .join("");
  files["sign-snow.svg"] = svg(520, 650, SNOW, body);
}

// ── Снежинки ──────────────────────────────────────────────────────────────
const flake = (stroke, width) => {
  let arms = "";
  for (let k = 0; k < 6; k++)
    arms += `<path transform="rotate(${k * 60})" d="M0,0V-44M0,-15L-10,-25M0,-15L10,-25M0,-29L-7,-36M0,-29L7,-36"/>`;
  return svg(
    100,
    100,
    "",
    `<g fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${arms}<circle r="5"/></g>`,
    "-50 -50 100 100",
  );
};
// Белая — для еле заметного фона главы (цвет снимает фильтр, как у листьев).
files["snowflake.svg"] = flake("#fff", 4);
// Голубая — значок перед названием главы: видна и на тёмной теме, и на светлой.
files["snowflake-ice.svg"] = flake("#7fb0d4", 7);

await mkdir(OUT, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  await writeFile(`${OUT}/${name}`, content);
  console.log(`${OUT}/${name}  ${(content.length / 1024).toFixed(1)} КБ`);
}
