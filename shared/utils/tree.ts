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

/** Обычный — два подарка, необычный — три, редкий — есть золотое слово. */
export type TitleRarity = "common" | "uncommon" | "rare";

/** off — ёлки нет и титулов не видно; admins — проба; on — ивент идёт;
 *  ended — ивент закончился: ёлки нет, а надетые титулы остаются у имён. */
export type TreeMode = "off" | "admins" | "on" | "ended";

/** Титул, каким его видят у имени. */
export type NameTitle = {
  id: number;
  text: string;
  rarity: TitleRarity;
};

/** Титул из коллекции. */
/** Слово из подарка — что показать в открытой коробке. */
export type TreeGift = {
  kind: TreeWordKind;
  word: string;
  rare: boolean;
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
  title: { text: string; rarity: TitleRarity };
  /** Тот же титул по словам — чтобы подсветить новое (оно на месте slot). */
  parts: string[];
  /** Золотое ли новое слово. */
  rare: boolean;
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
export type BoardEntry = {
  id: number;
  text: string;
  rarity: TitleRarity;
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

/** Шанс третьего подарка и золотого слова, в процентах. */
export const TREE_THREE_CHANCE_DEFAULT = 40;
export const TREE_RARE_CHANCE_DEFAULT = 3;

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

/** Слово из базы — то, из чего тянется жребий. */
export type DrawWord = AdjForms & {
  id: number;
  kind: TreeWordKind;
  gender: Gender | null;
  rare: boolean;
};

export type Draw = {
  text: string;
  rarity: TitleRarity;
  gifts: TreeGift[];
  words: TitleWords;
};

/**
 * Жребий титула. rand(n) — целое от 0 до n−1: на сервере криптостойкое, в
 * тестах — заданное.
 *
 * Сначала — сколько подарков (третий — с шансом threeChance %), потом —
 * будет ли среди слов золотое (rareChance %). Золотое достаётся одному
 * случайному месту из тех, где золотые слова есть. Нет прилагательных или
 * существительных вовсе — null: собрать титул не из чего.
 */
export function drawTitle(
  words: DrawWord[],
  threeChance: number,
  rareChance: number,
  rand: (n: number) => number,
): Draw | null {
  const pool = (kind: TreeWordKind, rare: boolean) =>
    words.filter((w) => w.kind === kind && w.rare === rare);
  const any = (kind: TreeWordKind) => words.some((w) => w.kind === kind);
  if (!any("adj") || !any("noun")) return null;

  const three = any("tail") && rand(100) < threeChance;
  const slots: TreeWordKind[] = three
    ? ["adj", "noun", "tail"]
    : ["adj", "noun"];

  const rareSlots = slots.filter((k) => pool(k, true).length);
  const rareSlot =
    rareSlots.length && rand(100) < rareChance
      ? rareSlots[rand(rareSlots.length)]!
      : null;

  const picked = slots.map((kind) => {
    const want = pool(kind, kind === rareSlot);
    // Обычных слов этого вида нет — берём золотое: подарок пустым не бывает.
    const from = want.length ? want : pool(kind, !(kind === rareSlot));
    return from[rand(from.length)]!;
  });

  const [adj, noun, tail] = picked as [DrawWord, DrawWord, DrawWord?];
  const gender = noun.gender ?? "m";
  return {
    text: composeTitle(adj, { word: noun.word, gender }, tail),
    rarity: rarityOf(
      slots.length,
      picked.some((w) => w.rare),
    ),
    words: { adj: adj.id, noun: noun.id, ...(tail ? { tail: tail.id } : {}) },
    gifts: [
      { kind: "adj", word: adjFor(adj, gender), rare: adj.rare },
      { kind: "noun", word: noun.word, rare: noun.rare },
      ...(tail
        ? [{ kind: "tail" as const, word: tail.word, rare: tail.rare }]
        : []),
    ],
  };
}

export const rarityOf = (gifts: number, hasRare: boolean): TitleRarity =>
  hasRare ? "rare" : gifts >= 3 ? "uncommon" : "common";

/** Титул из слов по номерам. Какого-то слова нет (удалили) — null. */
export function buildTitle(
  byId: Map<number, DrawWord>,
  words: TitleWords,
): { text: string; rarity: TitleRarity } | null {
  const adj = byId.get(words.adj);
  const noun = byId.get(words.noun);
  const tail = words.tail ? byId.get(words.tail) : undefined;
  if (!adj || !noun || (words.tail && !tail)) return null;
  const gender = noun.gender ?? "m";
  const picked = [adj, noun, ...(tail ? [tail] : [])];
  return {
    text: composeTitle(adj, { word: noun.word, gender }, tail),
    rarity: rarityOf(
      picked.length,
      picked.some((w) => w.rare),
    ),
  };
}

/**
 * Что можно получить, поставив в свой титул одно слово из нового. Не
 * предлагаем замену, от которой ничего не меняется, и ту, что даёт ровно
 * новый титул, — для этого есть «взять целиком».
 */
export function titleSwaps(
  byId: Map<number, DrawWord>,
  mine: TitleWords,
  fresh: TitleWords,
): TitleSwap[] {
  const now = buildTitle(byId, mine);
  const whole = buildTitle(byId, fresh);
  if (!now || !whole) return [];
  const out: TitleSwap[] = [];
  for (const slot of ["adj", "noun", "tail"] as const) {
    const id = fresh[slot];
    if (!id || id === mine[slot]) continue;
    const next = { ...mine, [slot]: id };
    const title = buildTitle(byId, next);
    if (!title || title.text === now.text || title.text === whole.text)
      continue;
    const noun = byId.get(next.noun)!;
    const gender = noun.gender ?? "m";
    const w = byId.get(id)!;
    const tail = next.tail ? byId.get(next.tail) : undefined;
    out.push({
      slot,
      word: slot === "adj" ? adjFor(w, gender) : w.word,
      title,
      parts: [
        adjFor(byId.get(next.adj)!, gender),
        noun.word,
        ...(tail ? [tail.word] : []),
      ],
      rare: w.rare,
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

export const RARITY_LABEL: Record<TitleRarity, string> = {
  common: "обычный",
  uncommon: "необычный",
  rare: "редкий",
};

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
