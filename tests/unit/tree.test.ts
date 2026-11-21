import { describe, expect, it } from "vitest";
import type { DrawWord } from "../../shared/utils/tree";
import {
  adjFor,
  agreeAdjective,
  buildTitle,
  composeTitle,
  drawTitle,
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
  rare: false,
  ...extra,
});

const WORDS: DrawWord[] = [
  w(1, "adj", "Сонный"),
  w(2, "adj", "Великий", { rare: true }),
  w(3, "noun", "Варежка", { gender: "f" }),
  w(4, "noun", "Дракон", { rare: true }),
  w(5, "tail", "по средам"),
  w(6, "tail", "всея Изрила", { rare: true }),
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
  it("два подарка — обычный титул", () => {
    // третий: 99 ≥ 40 — нет; золото: 99 ≥ 3 — нет; слова — первые.
    const d = drawTitle(WORDS, 40, 3, scripted([99, 99, 0, 0]))!;
    expect(d.text).toBe("Сонная Варежка");
    expect(d.rarity).toBe("common");
    expect(d.gifts.map((g) => g.word)).toEqual(["Сонная", "Варежка"]);
  });

  it("три подарка — необычный", () => {
    const d = drawTitle(WORDS, 40, 3, scripted([0, 99, 0, 0, 0]))!;
    expect(d.text).toBe("Сонная Варежка по средам");
    expect(d.rarity).toBe("uncommon");
  });

  it("золотое слово делает титул редким и согласуется с ним", () => {
    // третьего нет, золото есть, золотое место — второе (существительное).
    const d = drawTitle(WORDS, 40, 3, scripted([99, 0, 1, 0, 0]))!;
    expect(d.text).toBe("Сонный Дракон");
    expect(d.rarity).toBe("rare");
    expect(d.gifts[1]).toEqual({ kind: "noun", word: "Дракон", rare: true });
  });

  it("без хвостиков третьего подарка не бывает", () => {
    const noTails = WORDS.filter((x) => x.kind !== "tail");
    const d = drawTitle(noTails, 100, 0, scripted([0, 0]))!;
    expect(d.gifts).toHaveLength(2);
  });

  it("нет существительных — собрать не из чего", () => {
    expect(
      drawTitle(
        WORDS.filter((x) => x.kind !== "noun"),
        40,
        3,
        () => 0,
      ),
    ).toBeNull();
  });
});

describe("ёлка: одно слово в свой титул", () => {
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
    gender: null,
    rare: false,
    ...extra,
  });
  const byId = new Map(
    [
      w(1, "adj", "Ворчливый"),
      w(2, "adj", "Великий", { rare: true }),
      w(3, "noun", "Половник", { gender: "m" }),
      w(4, "noun", "Сковородка", { gender: "f" }),
      w(5, "tail", "из Лискора"),
      w(6, "tail", "по средам"),
    ].map((x) => [x.id, x]),
  );

  it("собирает титул по номерам и считает редкость", () => {
    expect(buildTitle(byId, { adj: 1, noun: 4 })).toEqual({
      text: "Ворчливая Сковородка",
      rarity: "common",
    });
    expect(buildTitle(byId, { adj: 2, noun: 3, tail: 5 })).toEqual({
      text: "Великий Половник из Лискора",
      rarity: "rare",
    });
    expect(buildTitle(byId, { adj: 1, noun: 99 })).toBeNull();
  });

  it("новое существительное перестраивает прилагательное под род", () => {
    const swaps = titleSwaps(byId, { adj: 1, noun: 3 }, { adj: 2, noun: 4 });
    expect(swaps).toMatchObject([
      {
        slot: "adj",
        word: "Великий",
        title: { text: "Великий Половник", rarity: "rare" },
        parts: ["Великий", "Половник"],
        rare: true,
      },
      {
        slot: "noun",
        word: "Сковородка",
        title: { text: "Ворчливая Сковородка", rarity: "common" },
        parts: ["Ворчливая", "Сковородка"],
        rare: false,
      },
    ]);
  });

  it("прилагательное приходит в роде своего существительного", () => {
    const swaps = titleSwaps(
      byId,
      { adj: 1, noun: 4 },
      { adj: 2, noun: 4, tail: 5 },
    );
    // Сковородка совпала — замены существительного нет, а «Великий» в
    // её роде.
    expect(swaps.find((s) => s.slot === "adj")).toMatchObject({
      slot: "adj",
      word: "Великая",
      title: { text: "Великая Сковородка", rarity: "rare" },
    });
  });

  it("хвост можно дописать, и титул становится необычным", () => {
    const swaps = titleSwaps(
      byId,
      { adj: 1, noun: 3 },
      { adj: 2, noun: 4, tail: 6 },
    );
    expect(swaps.find((s) => s.slot === "tail")).toMatchObject({
      slot: "tail",
      word: "по средам",
      title: { text: "Ворчливый Половник по средам", rarity: "uncommon" },
    });
  });

  it("не предлагает того, что ничего не меняет или равно новому целиком", () => {
    // Отличается одно слово — замена дала бы ровно новый титул.
    expect(titleSwaps(byId, { adj: 1, noun: 3 }, { adj: 2, noun: 3 })).toEqual(
      [],
    );
    expect(titleSwaps(byId, { adj: 1, noun: 3 }, { adj: 1, noun: 3 })).toEqual(
      [],
    );
  });
});
