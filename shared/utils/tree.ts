import type { AvatarFrame } from "./avatarFrames";

/**
 * Новогодняя ёлка: трясёшь — выпадают два или три подарка, в каждом слово, из
 * слов складывается титул. Титул носится у имени в квадратных скобках, как
 * класс в TWI, и копится в коллекцию.
 *
 * Здесь — то, что нужно и серверу, и странице: род слов, согласование,
 * сборка титула и тексты по умолчанию.
 */

export type TreeWordKind = "adj" | "noun" | "tail";
export type Gender = "m" | "f" | "n";

/** Старая отметка редкости в базе (user_titles.rarity). Показывается теперь
 *  редкость слов — TreeTier; это поле только пишется для истории. */
export type TitleRarity = "common" | "uncommon" | "rare";

/**
 * Редкость слова. Свои у ивента, заводятся в админке: «Необычное», «Редкое»,
 * «Эпическое»… Шанс — сколько процентов титулов получат слово этой
 * редкости; чем шанс меньше, тем редкость сильнее. pinned — такие титулы
 * стоят на доске сверху.
 */
export type TreeTier = {
  id: number;
  name: string;
  color: string;
  chance: number;
  pinned: boolean;
  /** Ореол вокруг слова — для тёмных цветов, как у карточек персонажей. */
  glow: boolean;
};

/** Как редкость показывается рядом со словом или титулом. null — обычное. */
export type TierMark = {
  id: number;
  name: string;
  color: string;
  glow: boolean;
};

export const tierMark = (t: TreeTier | null | undefined): TierMark | null =>
  t ? { id: t.id, name: t.name, color: t.color, glow: t.glow } : null;

/** Стиль слова этой редкости: цвет, а со свечением — светлее и с ореолом её
 *  цвета. Обычное слово — без стиля. */
export const tierTextStyle = (
  t: TierMark | null | undefined,
): Record<string, string> | undefined =>
  !t
    ? undefined
    : t.glow
      ? {
          color: `color-mix(in srgb, ${t.color} 45%, white)`,
          textShadow: `0 0 6px ${t.color}, 0 0 14px ${t.color}, 0 0 26px ${t.color}aa`,
        }
      : { color: t.color };

/** Подпись редкости: имя или «обычный». */
export const tierLabel = (t: TierMark | null | undefined): string =>
  t?.name ?? "обычный";

/** Из нескольких редкостей — самая сильная: с самым маленьким шансом. */
export function bestTier(
  tiers: (TreeTier | null | undefined)[],
): TreeTier | null {
  let best: TreeTier | null = null;
  for (const t of tiers) if (t && (!best || t.chance < best.chance)) best = t;
  return best;
}

export const TIER_COLOR_RE = /^#[0-9a-f]{6}$/i;

/**
 * «Необычное» — не заводится в админке, а выходит само: слово из подарка,
 * в котором два слова и больше, не считая предлогов («Почти Героический»,
 * «после третьей кружки»). «из Лискора» — одно: «из» — предлог. Своя
 * редкость у слова важнее. Самое слабое из особых: шанс — 100.
 */
export const UNCOMMON_TIER: TreeTier = {
  id: 0,
  name: "Необычное",
  color: "#a9d3ef",
  chance: 100,
  pinned: false,
  glow: false,
};

const PREPOSITIONS = new Set(
  (
    "в во на из изо с со к ко у о об обо от ото до по за под подо над надо " +
    "при про без безо для через перед пред меж между сквозь вокруг около " +
    "после среди ради возле вдоль кроме вместо внутри вне из-за из-под"
  ).split(" "),
);

/** Два слова и больше, не считая предлогов. */
export const isMultiWord = (word: string): boolean =>
  word
    .trim()
    .split(/\s+/)
    .filter((w) => w && !PREPOSITIONS.has(w.toLowerCase())).length >= 2;

/** Редкость слова: своя из админки, а нет её — «Необычное», если слово
 *  составное, иначе обычное (null). */
export function tierOfWord(
  w: { word: string; tierId: number | null },
  tiers: Map<number, TreeTier>,
): TreeTier | null {
  const own = w.tierId == null ? null : (tiers.get(w.tierId) ?? null);
  if (own) return own;
  return isMultiWord(w.word) ? UNCOMMON_TIER : null;
}

/** Шанс редкости в процентах: от 0 до 100, до сотых. Мусор — null. */
export const tierChanceOf = (v: unknown): number | null => {
  const n = Number(v);
  if (v === "" || v == null || !Number.isFinite(n)) return null;
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
};

/** off — ёлки нет и титулов не видно; admins — проба; on — ивент идёт;
 *  ended — ивент закончился: ёлки нет, а надетые титулы остаются у имён. */
export type TreeMode = "off" | "admins" | "on" | "ended";

/** Слово титула — как оно стоит в титуле (прилагательное уже в роде) и его
 *  редкость. */
export type TitlePart = { text: string; tier: TierMark | null };

/** Титул, каким его видят у имени. tier — самая сильная редкость слов в нём. */
export type NameTitle = {
  id: number;
  text: string;
  tier: TierMark | null;
  /** По словам — чтобы редкие подчеркнуть. Нет — титул старый, без слов. */
  parts?: TitlePart[];
};

/** Слово из подарка — что показать в открытой коробке. */
export type TreeGift = {
  kind: TreeWordKind;
  word: string;
  tier: TierMark | null;
};

/** Из каких слов собран титул — номера слов ёлки по местам. */
export type TitleWords = { adj: number; noun: number; tail?: number };

/**
 * Одно слово из нового титула — в свой: на то же место. Прилагательное
 * подстраивается под род, хвост можно и дописать, если его не было.
 */
export type TitleSwap = {
  slot: TreeWordKind;
  /** Слово, как оно встанет в титул. */
  word: string;
  /** Что получится. */
  title: { text: string; tier: TierMark | null };
  /** Тот же титул по словам — чтобы подсветить новое (оно на месте slot). */
  parts: TitlePart[];
  /** Редкость нового слова. */
  tier: TierMark | null;
};

export type ShakeResult = {
  gifts: TreeGift[];
  /** Что выпало. Само не надевается — его берут или оставляют свой. */
  title: NameTitle;
  /** Что надето сейчас — с ним сравнивают перед выбором. */
  current: NameTitle | null;
  /** Какое одно слово можно поставить в надетый титул. */
  swaps: TitleSwap[];
};

/** Строка доски титулов. */
export type BoardEntry = NameTitle & {
  wonAt: string;
  name: string;
  code: string | null;
  avatarUrl: string | null;
  avatarFrame: AvatarFrame | null;
};

export type TreeBoard = {
  rare: BoardEntry[];
  recent: BoardEntry[];
};

/** Что окну ёлки нужно знать о вошедшем. */
export type TreeMe = {
  /** Может ли трясти прямо сейчас. Админ — всегда. */
  canShake: boolean;
  /** Что выпало сегодня, если уже тряс. До полуночи его ещё можно взять. */
  today: NameTitle | null;
  /** Что надето сейчас. */
  current: NameTitle | null;
  /** Какое слово из сегодняшнего можно поставить в надетый — пока не взят. */
  swaps: TitleSwap[];
};

export type TreeState = {
  texts: TreeTexts;
  /** null — гость. */
  me: TreeMe | null;
};

export const TREE_MODES: { value: TreeMode; label: string }[] = [
  { value: "off", label: "Выключена" },
  { value: "admins", label: "Только для админов" },
  { value: "on", label: "Для всех" },
  { value: "ended", label: "Ивент закончен — титулы остаются" },
];

export const treeModeOf = (v: unknown): TreeMode =>
  v === "admins" || v === "on" || v === "ended" ? v : "off";

/** Тексты баннера и окна. Правятся в админке; пустое поле — значит, по умолчанию. */
export const TREE_TEXTS = {
  tree_title: "Новогодняя ёлка",
  tree_text:
    "Потряси ёлку — из неё выпадут подарки, а из слов в них сложится твой титул.",
  tree_button: "Потрясти ёлку",
  tree_board_title: "Доска титулов",
} as const;

export type TreeTextKey = keyof typeof TREE_TEXTS;
export type TreeTexts = Record<TreeTextKey, string>;

export const fullTreeTexts = (
  settings: Partial<Record<string, string>> | null | undefined,
): TreeTexts =>
  Object.fromEntries(
    (Object.keys(TREE_TEXTS) as TreeTextKey[]).map((k) => [
      k,
      settings?.[k]?.trim() || TREE_TEXTS[k],
    ]),
  ) as TreeTexts;

/** Шанс третьего подарка, в процентах. Шансы редкостей — у самих редкостей. */
export const TREE_THREE_CHANCE_DEFAULT = 40;

export const percentOf = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return v !== "" && v != null && Number.isFinite(n)
    ? Math.min(100, Math.max(0, Math.round(n)))
    : fallback;
};

/** Сколько ударов по ёлке (кликов или встрясок), пока не посыплются подарки. */
export const TREE_HITS = 5;

export const WORD_MAX = 40;

// ── Согласование ─────────────────────────────────
// Админ вписывает прилагательное в мужском роде, женский и средний
// получаются сами. Не вышло — «Третий» → «Третья», — их можно вписать руками.

const HUSHING = /[жшчщ]$/i;
const VELAR = /[кгх]$/i;

/** Одно слово в нужном роде. Не прилагательное — как есть. */
function agreeWord(word: string, gender: Exclude<Gender, "m">): string {
  // Причастия на -ся: «Невыспавшийся» → «Невыспавшаяся».
  const reflexive = /ся$/i.test(word) && /(ый|ий|ой)ся$/i.test(word);
  const base = reflexive ? word.slice(0, -2) : word;
  const m = /^(.*[а-яё])(ый|ий|ой)$/i.exec(base);
  if (!m) return word;

  const stem = m[1]!;
  const ending = m[2]!.toLowerCase();
  let out: string;
  if (ending === "ий" && !HUSHING.test(stem) && !VELAR.test(stem)) {
    // Мягкие: «Зимний» → «Зимняя», «Зимнее».
    out = stem + (gender === "f" ? "яя" : "ее");
  } else if (gender === "f") {
    out = stem + "ая";
  } else {
    // «Хороший» → «Хорошее», но «Большой» → «Большое»: ударное -ой даёт -ое.
    out = stem + (ending === "ий" && HUSHING.test(stem) ? "ее" : "ое");
  }
  return reflexive ? out + "ся" : out;
}

/** Прилагательное в роде существительного. Несколько слов — «Слегка
 *  Проклятый» — согласуются по отдельности, наречия остаются как были. */
export function agreeAdjective(masc: string, gender: Gender): string {
  if (gender === "m") return masc;
  return masc
    .split(/(\s+)/)
    .map((w) => (/\s/.test(w) ? w : agreeWord(w, gender)))
    .join("");
}

export type AdjForms = {
  word: string;
  wordF: string | null;
  wordN: string | null;
};

/** Прилагательное в нужном роде: вписанное руками важнее угаданного. */
export function adjFor(adj: AdjForms, gender: Gender): string {
  if (gender === "f" && adj.wordF) return adj.wordF;
  if (gender === "n" && adj.wordN) return adj.wordN;
  return agreeAdjective(adj.word, gender);
}

/** Титул без скобок: «Ворчливый Табурет из Лискора». */
export function composeTitle(
  adj: AdjForms,
  noun: { word: string; gender: Gender },
  tail?: { word: string } | null,
): string {
  return [adjFor(adj, noun.gender), noun.word, tail?.word]
    .filter(Boolean)
    .join(" ");
}

/** Слово из базы — то, из чего тянется жребий. tierId — редкость; null —
 *  обычное. */
export type DrawWord = AdjForms & {
  id: number;
  kind: TreeWordKind;
  gender: Gender | null;
  tierId: number | null;
};

/** Слова и редкости ёлки по номерам — чтобы собирать титулы. */
export type WordBook = {
  words: Map<number, DrawWord>;
  tiers: Map<number, TreeTier>;
};

export type Draw = {
  text: string;
  tier: TreeTier | null;
  gifts: TreeGift[];
  words: TitleWords;
};

/**
 * Жребий титула. rand(n) — целое от 0 до n−1: на сервере криптостойкое, в
 * тестах — заданное.
 *
 * Сначала — сколько подарков (третий — с шансом threeChance %). Потом один
 * бросок на весь титул: от самой редкой редкости к самой частой, каждая
 * занимает свои проценты — 1 % у «Эпического», 3 % у «Редкого» и т.д. Выпала
 * редкость — её слово встаёт на одно случайное место из тех, где такие слова
 * есть; остальные места — обычные слова. Нет прилагательных или
 * существительных вовсе — null: собрать титул не из чего.
 */
export function drawTitle(
  words: DrawWord[],
  tiers: TreeTier[],
  threeChance: number,
  rand: (n: number) => number,
): Draw | null {
  const pool = (kind: TreeWordKind, tierId: number | null) =>
    words.filter((w) => w.kind === kind && (w.tierId ?? null) === tierId);
  const any = (kind: TreeWordKind) => words.some((w) => w.kind === kind);
  if (!any("adj") || !any("noun")) return null;

  const three = any("tail") && rand(100) < threeChance;
  const slots: TreeWordKind[] = three
    ? ["adj", "noun", "tail"]
    : ["adj", "noun"];

  // Бросок — в сотых долях процента, чтобы работали шансы вроде 0,5 %.
  const roll = rand(10000);
  let edge = 0;
  let special: { tier: TreeTier; slot: TreeWordKind } | null = null;
  for (const t of [...tiers].sort((x, y) => x.chance - y.chance)) {
    edge += Math.round(t.chance * 100);
    if (roll >= edge) continue;
    const places = slots.filter((k) => pool(k, t.id).length);
    if (places.length)
      special = { tier: t, slot: places[rand(places.length)]! };
    break;
  }

  const picked = slots.map((kind) => {
    if (special?.slot === kind) {
      const from = pool(kind, special.tier.id);
      return from[rand(from.length)]!;
    }
    // Обычных слов этого вида нет — берём любое: подарок пустым не бывает.
    const common = pool(kind, null);
    const from = common.length ? common : words.filter((w) => w.kind === kind);
    return from[rand(from.length)]!;
  });

  const tierMap = new Map(tiers.map((t) => [t.id, t]));
  const tierOf = (w: DrawWord) => tierOfWord(w, tierMap);
  const [adj, noun, tail] = picked as [DrawWord, DrawWord, DrawWord?];
  const gender = noun.gender ?? "m";
  return {
    text: composeTitle(adj, { word: noun.word, gender }, tail),
    tier: bestTier(picked.map(tierOf)),
    words: { adj: adj.id, noun: noun.id, ...(tail ? { tail: tail.id } : {}) },
    gifts: [
      { kind: "adj", word: adjFor(adj, gender), tier: tierMark(tierOf(adj)) },
      { kind: "noun", word: noun.word, tier: tierMark(tierOf(noun)) },
      ...(tail
        ? [
            {
              kind: "tail" as const,
              word: tail.word,
              tier: tierMark(tierOf(tail)),
            },
          ]
        : []),
    ],
  };
}

/** Старая отметка для базы: есть особое слово — rare, три слова — uncommon. */
export const legacyRarity = (
  tier: TreeTier | null,
  gifts: number,
): TitleRarity =>
  tier && tier.id > 0 ? "rare" : tier || gifts >= 3 ? "uncommon" : "common";

/** Номер редкости для базы: «Необычное» само выходит из слов — не хранится. */
export const tierIdOf = (tier: TreeTier | null): number | null =>
  tier && tier.id > 0 ? tier.id : null;

const wordTier = (book: WordBook, w: DrawWord): TreeTier | null =>
  tierOfWord(w, book.tiers);

/** Слова титула по номерам. Какого-то слова нет (удалили) — null. */
function titleWordsOf(book: WordBook, words: TitleWords) {
  const adj = book.words.get(words.adj);
  const noun = book.words.get(words.noun);
  const tail = words.tail ? book.words.get(words.tail) : undefined;
  if (!adj || !noun || (words.tail && !tail)) return null;
  return { adj, noun, tail };
}

/** Титул по словам: прилагательное в роде существительного, у каждого слова
 *  — его редкость. */
export function titleParts(
  book: WordBook,
  words: TitleWords,
): TitlePart[] | null {
  const w = titleWordsOf(book, words);
  if (!w) return null;
  return [
    {
      text: adjFor(w.adj, w.noun.gender ?? "m"),
      tier: tierMark(wordTier(book, w.adj)),
    },
    { text: w.noun.word, tier: tierMark(wordTier(book, w.noun)) },
    ...(w.tail
      ? [{ text: w.tail.word, tier: tierMark(wordTier(book, w.tail)) }]
      : []),
  ];
}

/** Титул из слов по номерам и его редкость — самая сильная из слов. */
export function buildTitle(
  book: WordBook,
  words: TitleWords,
): { text: string; tier: TreeTier | null } | null {
  const w = titleWordsOf(book, words);
  if (!w) return null;
  const gender = w.noun.gender ?? "m";
  const picked = [w.adj, w.noun, ...(w.tail ? [w.tail] : [])];
  return {
    text: composeTitle(w.adj, { word: w.noun.word, gender }, w.tail),
    tier: bestTier(picked.map((x) => wordTier(book, x))),
  };
}

/**
 * Что можно получить, поставив в свой титул одно слово из нового. Не
 * предлагаем замену, от которой ничего не меняется, и ту, что даёт ровно
 * новый титул, — для этого есть «взять целиком».
 */
export function titleSwaps(
  book: WordBook,
  mine: TitleWords,
  fresh: TitleWords,
): TitleSwap[] {
  const now = buildTitle(book, mine);
  const whole = buildTitle(book, fresh);
  if (!now || !whole) return [];
  const out: TitleSwap[] = [];
  for (const slot of ["adj", "noun", "tail"] as const) {
    const id = fresh[slot];
    if (!id || id === mine[slot]) continue;
    const next = { ...mine, [slot]: id };
    const title = buildTitle(book, next);
    if (!title || title.text === now.text || title.text === whole.text)
      continue;
    const gender = book.words.get(next.noun)!.gender ?? "m";
    const w = book.words.get(id)!;
    out.push({
      slot,
      word: slot === "adj" ? adjFor(w, gender) : w.word,
      title: { text: title.text, tier: tierMark(title.tier) },
      parts: titleParts(book, next)!,
      tier: tierMark(wordTier(book, w)),
    });
  }
  return out;
}

/** Собрать титул из своего и одного слова нового — то же, что в titleSwaps. */
export function swapWords(
  mine: TitleWords,
  fresh: TitleWords,
  slot: TreeWordKind,
): TitleWords | null {
  const id = fresh[slot];
  return id ? { ...mine, [slot]: id } : null;
}

export const GENDER_LABEL: Record<Gender, string> = {
  m: "он",
  f: "она",
  n: "оно",
};

export const isGender = (v: unknown): v is Gender =>
  v === "m" || v === "f" || v === "n";

export const isWordKind = (v: unknown): v is TreeWordKind =>
  v === "adj" || v === "noun" || v === "tail";

/** Слово, каким его можно сохранить: одна строка, без лишних пробелов. */
export const cleanWord = (v: unknown): string =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, WORD_MAX);
