import sanitizeHtml from "sanitize-html";

/*
  Прозрачность из epub. В книге она задаётся где угодно: в style у абзаца, в
  <style> или в отдельном css по классу. До текста главы доходит только разметка
  без таблиц стилей, поэтому прозрачность переносим в сам текст — на <span>:
  правку в админке переживают только они, стили абзаца редактор теряет.

  Что во что переходит:
  - opacity — остаётся opacity;
  - цветной полупрозрачный текст — остаётся своим rgba;
  - «текст, только бледнее» (currentColor с transparent, чёрный, белый или серый
    с альфой) — .invisible-text с долей в --faint: цвет берётся от темы читалки,
    а то чёрный с альфой на тёмной странице пропал бы совсем.

  Непрозрачные цвета из таблиц стилей не переносим нарочно: Google Docs ставит
  каждому слову «чёрный», и на тёмной теме глава стала бы нечитаемой.
*/

type Rgb = [number, number, number];
/** rgb = null — цвет самого текста (currentColor). */
type TextColor = { alpha: number; rgb: Rgb | null };
type Declarations = { color?: TextColor; opacity?: number };
type Effect = { faint?: number; opacity?: number; color?: string };
type Rule = {
  tag: string;
  id: string;
  classes: string[];
  weight: number;
  own: Declarations;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number) => Number(n.toFixed(3));

const parseRatio = (s: string): number | null => {
  const m = s.trim().match(/^(\d*\.?\d+)(%?)$/);
  return m ? clamp01(Number(m[1]) / (m[2] ? 100 : 1)) : null;
};

const hslToRgb = (h: number, s: number, l: number): Rgb => {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
};

/** null — запись непонятна; названия цветов вроде «red» считаются непрозрачными. */
export function parseTextColor(value: string): TextColor | null {
  const v = value.trim().toLowerCase();
  if (v === "transparent") return { alpha: 0, rgb: null };
  if (/^[a-z]+$/.test(v)) return { alpha: 1, rgb: null };

  const hex = v.match(/^#([0-9a-f]+)$/)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    if (full.length !== 6 && full.length !== 8) return null;
    const at = (i: number) => parseInt(full.slice(i, i + 2), 16);
    const alpha = full.length === 8 ? at(6) / 255 : 1;
    return { alpha, rgb: [at(0), at(2), at(4)] };
  }

  const mix = v.match(/^color-mix\(\s*in [^,]+,(.*)\)$/)?.[1];
  if (mix) {
    const parts = mix.split(/,(?![^(]*\))/).map((p) => {
      const m = p.trim().match(/^(.*?)(?:\s+(\d*\.?\d+)%)?$/);
      return { color: m?.[1] ?? "", share: m?.[2] ? Number(m[2]) / 100 : null };
    });
    const clear = parts.find((p) => p.color === "transparent");
    const ink = parts.find((p) => p.color !== "transparent");
    if (parts.length !== 2 || !clear || !ink) return null;
    const base = parseTextColor(ink.color);
    if (!base) return null;
    const share = ink.share ?? (clear.share === null ? 0.5 : 1 - clear.share);
    return { alpha: clamp01(share) * base.alpha, rgb: base.rgb };
  }

  const fn = v.match(/^(rgb|hsl)a?\(([^()]+)\)$/);
  if (!fn) return null;
  const args = fn[2]!.split(/[\s,/]+/).filter(Boolean);
  const alpha = args.length > 3 ? parseRatio(args[3]!) : 1;
  const nums = args.slice(0, 3).map((a) => parseFloat(a));
  if (alpha === null || nums.length < 3 || nums.some(Number.isNaN)) return null;
  const [a, b, c] = nums as Rgb;
  if (fn[1] === "hsl") {
    const hue = ((a % 360) + 360) % 360;
    return { alpha, rgb: hslToRgb(hue, b / 100, c / 100) };
  }
  const scale = args[0]!.endsWith("%") ? 2.55 : 1;
  return { alpha, rgb: [a, b, c].map((n) => Math.round(n * scale)) as Rgb };
}

/** Из повторов берём последний понятный: строки перед ним — для старых читалок. */
function readDeclarations(body: string): Declarations {
  const out: Declarations = {};
  for (const decl of body.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).replace(/!\s*important/i, "");
    if (prop === "color") {
      const color = parseTextColor(value);
      if (color) out.color = color;
    } else if (prop === "opacity") {
      const opacity = parseRatio(value);
      if (opacity !== null) out.opacity = opacity;
    }
  }
  return out;
}

/** Простые селекторы: тег, .класс, #id и их сочетания. Вложенные и :псевдо — мимо. */
export function parseCssRules(css: string): Rule[] {
  const plain = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--|-->|<!\[CDATA\[|\]\]>/g, "")
    .replace(/@[^{};]+;/g, "")
    .replace(/@[^{};]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const rules: Rule[] = [];
  for (const [, selectors, body] of plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const own = readDeclarations(body!);
    if (!own.color && own.opacity === undefined) continue;
    for (const selector of selectors!.split(",")) {
      const m = selector
        .trim()
        .match(/^([a-z][a-z0-9]*|\*)?((?:[.#][\w-]+)*)$/i);
      if (!m?.[0]) continue;
      const parts = m[2]!.match(/[.#][\w-]+/g) ?? [];
      const classes = parts.filter((p) => p[0] === ".").map((p) => p.slice(1));
      const id = parts.find((p) => p[0] === "#")?.slice(1) ?? "";
      const tag = m[1] && m[1] !== "*" ? m[1].toLowerCase() : "";
      const weight = (id ? 100 : 0) + classes.length * 10 + (tag ? 1 : 0);
      rules.push({ tag, id, classes, weight, own });
    }
  }
  // Сортировка устойчивая: при равном весе побеждает правило ниже по файлу.
  return rules.sort((a, b) => a.weight - b.weight);
}

function effectOf(
  tag: string,
  attribs: Record<string, string>,
  rules: Rule[],
): Effect {
  const classes = (attribs.class ?? "").split(/\s+/);
  const inline = readDeclarations(attribs.style ?? "");
  const won: Declarations = {};
  for (const r of rules) {
    if (r.tag && r.tag !== tag) continue;
    if (r.id && r.id !== attribs.id) continue;
    if (r.classes.every((c) => classes.includes(c))) Object.assign(won, r.own);
  }
  Object.assign(won, inline);

  const fx: Effect = {};
  if (won.color && won.color.alpha < 1) {
    const { rgb, alpha } = won.color;
    // Почти без оттенка — это «текст бледнее», а не цвет.
    if (!rgb || Math.max(...rgb) - Math.min(...rgb) <= 12)
      fx.faint = round(alpha);
    else fx.color = `rgba(${rgb.join(", ")}, ${round(alpha)})`;
  }
  if (won.opacity !== undefined && won.opacity < 1) {
    // Спрятанный текст проступает при выделении, а opacity этого не даёт. Со
    // своим цветом так нельзя: он сильнее класса, и прозрачность бы потерялась.
    const hidden =
      classes.includes("invisible-text") && !inline.color && !fx.color;
    if (hidden) fx.faint = round((fx.faint ?? 1) * won.opacity);
    else fx.opacity = round(won.opacity);
  }
  return fx;
}

const isEmpty = (fx: Effect) => Object.keys(fx).length === 0;

/** Вложенные блоки: opacity перемножается, цвет берётся ближайший. */
function mergeEffects(outer: Effect, inner: Effect): Effect {
  const ownColor = inner.faint !== undefined || inner.color !== undefined;
  const fx: Effect = ownColor ? { ...inner } : { ...outer, ...inner };
  if (outer.opacity !== undefined)
    fx.opacity = round(outer.opacity * (inner.opacity ?? 1));
  return fx;
}

/** То, что уходит в span, со старого места убираем — иначе умножится дважды. */
function dropFromStyle(style: string, fx: Effect): string {
  return style
    .split(";")
    .filter((decl) => {
      const prop = decl.split(":")[0]!.trim().toLowerCase();
      if (prop === "opacity") return false;
      if (prop === "color")
        return fx.color === undefined && fx.faint === undefined;
      return prop !== "";
    })
    .join(";");
}

function effectAttrs(fx: Effect, className = "", style = "") {
  const classes = className.split(/\s+/).filter(Boolean);
  const styles = style ? [style] : [];
  if (fx.faint !== undefined) {
    if (!classes.includes("invisible-text")) classes.push("invisible-text");
    styles.push(`--faint:${fx.faint}`);
  }
  if (fx.color !== undefined) styles.push(`color:${fx.color}`);
  if (fx.opacity !== undefined) styles.push(`opacity:${fx.opacity}`);
  return (
    (classes.length ? ` class="${classes.join(" ")}"` : "") +
    ` style="${styles.join(";")}"`
  );
}

// ── Дерево ───────────────────────────────────────────────────
// Разметка на входе уже прошла sanitize-html: теги закрыты, знаки в атрибутах
// экранированы, — поэтому хватает стека, без полноценного разборщика HTML.

type El = { tag: string; attrs: string; fx: Effect; children: Child[] };
type Child = string | El;

const BLOCKS = new Set(
  "p div section article blockquote ul ol li table tbody tr td hr".split(" "),
);
const VOID = new Set(["br", "hr"]);

function buildTree(html: string): El {
  const root: El = { tag: "div", attrs: "", fx: {}, children: [] };
  const stack = [root];
  let last = 0;
  for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9]*)([^>]*)>/g)) {
    const top = stack[stack.length - 1]!;
    if (m.index > last) top.children.push(html.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1]) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const fx = m[3]!.match(/ data-fx="([^"]*)"/)?.[1];
    const el: El = {
      tag: m[2]!,
      attrs: m[3]!.replace(/ data-fx="[^"]*"/, ""),
      fx: fx ? JSON.parse(decodeURIComponent(fx)) : {},
      children: [],
    };
    top.children.push(el);
    if (!VOID.has(el.tag)) stack.push(el);
  }
  if (last < html.length) root.children.push(html.slice(last));
  return root;
}

const attr = (attrs: string, name: string) =>
  attrs.match(new RegExp(` ${name}="([^"]*)"`))?.[1] ?? "";

function renderInline(node: Child): string {
  if (typeof node === "string") return node;
  const { tag, attrs, fx } = node;
  if (VOID.has(tag)) return `<${tag} />`;
  const inner = node.children.map(renderInline).join("");
  if (isEmpty(fx)) return `<${tag}${attrs}>${inner}</${tag}>`;
  if (tag === "span")
    return `<span${effectAttrs(fx, attr(attrs, "class"), attr(attrs, "style"))}>${inner}</span>`;
  return `<${tag}${attrs}><span${effectAttrs(fx)}>${inner}</span></${tag}>`;
}

function renderBlock(el: El, inherited: Effect): string {
  const fx = mergeEffects(inherited, el.fx);
  let out = "";
  let run = "";
  const flush = () => {
    const wrap = !isEmpty(fx) && run.trim() !== "";
    out += wrap ? `<span${effectAttrs(fx)}>${run}</span>` : run;
    run = "";
  };
  for (const child of el.children) {
    if (typeof child === "string" || !BLOCKS.has(child.tag)) {
      run += renderInline(child);
      continue;
    }
    flush();
    out += VOID.has(child.tag)
      ? `<${child.tag} />`
      : `<${child.tag}${child.attrs}>${renderBlock(child, fx)}</${child.tag}>`;
  }
  flush();
  return out;
}

const INLINE_TAGS =
  "br em strong span i b u s a font small big sub sup cite q mark".split(" ");

/**
 * Переносит прозрачность из таблиц стилей и style на <span> внутри текста.
 * Итоговую чистку разметки не заменяет — она идёт следом, в parseEpub.
 */
export function inlineTransparency(bodyHtml: string, css: string): string {
  const rules = parseCssRules(css);
  let found = false;
  const marked = sanitizeHtml(bodyHtml, {
    allowedTags: [...BLOCKS, ...INLINE_TAGS],
    allowedAttributes: { "*": ["style", "class", "data-fx"] },
    transformTags: {
      "*": (tagName, attribs) => {
        const { "data-fx": _, ...clean } = attribs;
        const fx = effectOf(tagName, clean, rules);
        if (isEmpty(fx)) return { tagName, attribs: clean };
        found = true;
        const style = dropFromStyle(clean.style ?? "", fx);
        delete clean.style;
        return {
          tagName,
          attribs: {
            ...clean,
            ...(style && { style }),
            "data-fx": encodeURIComponent(JSON.stringify(fx)),
          },
        };
      },
    },
  });
  // Нечего переносить — отдаём разметку ровно той, какой пришла.
  return found ? renderBlock(buildTree(marked), {}) : bodyHtml;
}
