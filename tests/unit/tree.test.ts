import { describe, expect, it } from "vitest";
import type { DrawWord, TreeTier, WordBook } from "../../shared/utils/tree";
import {
  adjFor,
  agreeAdjective,
  bestTier,
  buildTitle,
  composeTitle,
  drawTitle,
  tierChanceOf,
  tierMark,
  tierTextStyle,
  titleParts,
  titleSwaps,
} from "../../shared/utils/tree";

describe("ёлка: согласование прилагательного", () => {
  it.each([
    ["Ворчливый", "Ворчливая", "Ворчливое"],
    ["Зимний", "Зимняя", "Зимнее"],
    ["Липкий", "Липкая", "Липкое"],
    ["Неуклюжий", "Неуклюжая", "Неуклюжее"],
    ["Блестящий", "Блестящая", "Блестящее"],
    ["Запасной", "Запасная", "Запасное"],
    ["Невыспавшийся", "Невыспавшаяся", "Невыспавшееся"],
    ["Подмёрзший", "Подмёрзшая", "Подмёрзшее"],
    ["Почти Героический", "Почти Героическая", "Почти Героическое"],
    ["Вечно Опаздывающий", "Вечно Опаздывающая", "Вечно Опаздывающее"],
  ])("%s → %s, %s", (m, f, n) => {
    expect(agreeAdjective(m, "m")).toBe(m);
    expect(agreeAdjective(m, "f")).toBe(f);
    expect(agreeAdjective(m, "n")).toBe(n);
  });

  it("вписанная руками форма важнее угаданной", () => {
    const adj = { word: "Третий", wordF: "Третья", wordN: null };
    expect(adjFor(adj, "f")).toBe("Третья");
    // Не вписано — угадываем, пусть и неверно: правится в админке.
    expect(adjFor(adj, "n")).toBe("Третее");
  });

  it("титул собирается в роде существительного", () => {
    const adj = { word: "Ворчливый", wordF: null, wordN: null };
    expect(composeTitle(adj, { word: "Сковородка", gender: "f" })).toBe(
      "Ворчливая Сковородка",
    );
    expect(
      composeTitle(
        adj,
        { word: "Полено", gender: "n" },
        { word: "из Лискора" },
      ),
    ).toBe("Ворчливое Полено из Лискора");
  });
});

const UNCOMMON: TreeTier = {
  id: 10,
  name: "Необычное",
  color: "#a9d3ef",
  chance: 15,
  pinned: false,
  glow: false,
};
const RARE: TreeTier = {
  id: 20,
  name: "Редкое",
  color: "#f2c14e",
  chance: 3,
  pinned: true,
  glow: false,
};
const EPIC: TreeTier = {
  id: 30,
  name: "Эпическое",
  color: "#8e44ad",
  chance: 1,
  pinned: true,
  glow: true,
};
const TIERS = [UNCOMMON, RARE, EPIC];
const mark = tierMark;

const w = (
  id: number,
  kind: DrawWord["kind"],
  word: string,
  extra: Partial<DrawWord> = {},
): DrawWord => ({
  id,
  kind,
  word,
  wordF: null,
  wordN: null,
  gender: kind === "noun" ? "m" : null,
  tierId: null,
  ...extra,
});

const WORDS: DrawWord[] = [
  w(1, "adj", "Сонный"),
  w(2, "adj", "Великий", { tierId: RARE.id }),
  w(3, "noun", "Варежка", { gender: "f" }),
  w(4, "noun", "Дракон", { tierId: EPIC.id }),
  w(5, "tail", "по средам"),
  w(6, "tail", "всея Изрила", { tierId: UNCOMMON.id }),
];

/** rand по списку ответов: что выпадет, задаёт тест. */
const scripted = (answers: number[]) => {
  const queue = [...answers];
  return (n: number) => {
    const v = queue.shift() ?? 0;
    expect(v).toBeLessThan(n);
    return v;
  };
};

describe("ёлка: жребий титула", () => {
  // Бросок редкости — в сотых долях процента: эпическое [0, 100),
  // редкое [100, 400), необычное [400, 1900), дальше — без особого слова.
  it("без особого слова — обычный титул", () => {
    // третий: 99 ≥ 40 — нет; редкость: 9999 — нет; слова — первые обычные.
    const d = drawTitle(WORDS, TIERS, 40, scripted([99, 9999, 0, 0]))!;
    expect(d.text).toBe("Сонная Варежка");
    expect(d.tier).toBeNull();
    expect(d.gifts.map((g) => g.word)).toEqual(["Сонная", "Варежка"]);
  });

  it("эпическое слово с шансом 1% и согласование с ним", () => {
    // третьего нет; бросок 50 — эпическое; место одно — существительное.
    const d = drawTitle(WORDS, TIERS, 40, scripted([99, 50, 0, 0]))!;
    expect(d.text).toBe("Сонный Дракон");
    expect(d.tier).toEqual(EPIC);
    expect(d.gifts[1]).toEqual({
      kind: "noun",
      word: "Дракон",
      tier: mark(EPIC),
    });
  });

  it("редкое — следующее окно броска", () => {
    const d = drawTitle(WORDS, TIERS, 40, scripted([99, 250, 0, 0]))!;
    expect(d.text).toBe("Великая Варежка");
    expect(d.tier).toEqual(RARE);
  });

  it("необычное хвостиком — на третьем подарке", () => {
    // третий есть; бросок 1000 — необычное; место — хвост.
    const d = drawTitle(WORDS, TIERS, 40, scripted([0, 1000, 0, 0, 0]))!;
    expect(d.text).toBe("Сонная Варежка всея Изрила");
    expect(d.tier).toEqual(UNCOMMON);
  });

  it("выпала редкость без слов для этих мест — титул обычный", () => {
    // необычные слова есть только в хвостах, а подарка три нет.
    const d = drawTitle(WORDS, TIERS, 40, scripted([99, 1000, 0, 0]))!;
    expect(d.tier).toBeNull();
  });

  it("без хвостиков третьего подарка не бывает", () => {
    const noTails = WORDS.filter((x) => x.kind !== "tail");
    const d = drawTitle(noTails, TIERS, 100, scripted([9999, 0, 0]))!;
    expect(d.gifts).toHaveLength(2);
  });

  it("нет существительных — собрать не из чего", () => {
    expect(
      drawTitle(
        WORDS.filter((x) => x.kind !== "noun"),
        TIERS,
        40,
        () => 0,
      ),
    ).toBeNull();
  });
});

describe("ёлка: титул по номерам и одно слово в свой", () => {
  const book: WordBook = {
    words: new Map(
      [
        w(1, "adj", "Ворчливый"),
        w(2, "adj", "Великий", { tierId: RARE.id }),
        w(3, "noun", "Половник", { gender: "m" }),
        w(4, "noun", "Сковородка", { gender: "f", tierId: UNCOMMON.id }),
        w(5, "tail", "из Лискора"),
        w(6, "tail", "по средам"),
      ].map((x) => [x.id, x]),
    ),
    tiers: new Map(TIERS.map((t) => [t.id, t])),
  };

  it("редкость титула — самая сильная из слов", () => {
    expect(buildTitle(book, { adj: 1, noun: 3 })).toEqual({
      text: "Ворчливый Половник",
      tier: null,
    });
    expect(buildTitle(book, { adj: 2, noun: 4 })).toEqual({
      text: "Великая Сковородка",
      tier: RARE,
    });
    expect(buildTitle(book, { adj: 1, noun: 99 })).toBeNull();
  });

  it("слова титула — в роде и со своей редкостью", () => {
    expect(titleParts(book, { adj: 2, noun: 4, tail: 5 })).toEqual([
      { text: "Великая", tier: mark(RARE) },
      { text: "Сковородка", tier: mark(UNCOMMON) },
      { text: "из Лискора", tier: null },
    ]);
  });

  it("новое существительное перестраивает прилагательное под род", () => {
    const swaps = titleSwaps(book, { adj: 1, noun: 3 }, { adj: 2, noun: 4 });
    expect(swaps).toMatchObject([
      {
        slot: "adj",
        word: "Великий",
        title: { text: "Великий Половник", tier: mark(RARE) },
        tier: mark(RARE),
      },
      {
        slot: "noun",
        word: "Сковородка",
        title: { text: "Ворчливая Сковородка", tier: mark(UNCOMMON) },
        parts: [
          { text: "Ворчливая", tier: null },
          { text: "Сковородка", tier: mark(UNCOMMON) },
        ],
        tier: mark(UNCOMMON),
      },
    ]);
  });

  it("хвост можно дописать", () => {
    const swaps = titleSwaps(
      book,
      { adj: 1, noun: 3 },
      { adj: 2, noun: 4, tail: 6 },
    );
    expect(swaps.find((s) => s.slot === "tail")).toMatchObject({
      word: "по средам",
      title: { text: "Ворчливый Половник по средам", tier: null },
    });
  });

  it("не предлагает того, что ничего не меняет или равно новому целиком", () => {
    expect(titleSwaps(book, { adj: 1, noun: 3 }, { adj: 2, noun: 3 })).toEqual(
      [],
    );
    expect(titleSwaps(book, { adj: 1, noun: 3 }, { adj: 1, noun: 3 })).toEqual(
      [],
    );
  });
});

describe("ёлка: редкости", () => {
  it("самая сильная — с меньшим шансом", () => {
    expect(bestTier([UNCOMMON, null, EPIC, RARE])).toEqual(EPIC);
    expect(bestTier([null, undefined])).toBeNull();
  });

  it("шанс — от 0 до 100, до сотых", () => {
    expect(tierChanceOf("0.5")).toBe(0.5);
    expect(tierChanceOf("1.234")).toBe(1.23);
    expect(tierChanceOf("150")).toBe(100);
    expect(tierChanceOf("")).toBeNull();
  });

  it("свечение — светлее и с ореолом её цвета", () => {
    expect(tierTextStyle(mark(RARE))).toEqual({ color: "#f2c14e" });
    expect(tierTextStyle(mark(EPIC))!.textShadow).toContain("#8e44ad");
    expect(tierTextStyle(null)).toBeUndefined();
  });
});
