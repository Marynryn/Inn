import { describe, expect, it } from "vitest";
import { telegramMarkupToHtml } from "#shared/utils/telegramMarkup";
import { slugifyChapterId } from "#shared/utils/slug";
import {
  displayNameKey,
  isGenericName,
  isStaffName,
  nameFromEmail,
  normalizeDisplayName,
  DISPLAY_NAME_MAX,
} from "#shared/utils/displayName";
import { countWords } from "#shared/utils/wordCount";
import {
  DEFAULT_READER_SETTINGS,
  normalizeReaderSettings,
} from "#shared/utils/readerSettings";
import {
  buildChapterNotification,
  sortChaptersForNotification,
} from "#shared/utils/chapterNotification";

describe("разметка для телеграма", () => {
  it("экранирует HTML, а **…** превращает в жирный", () => {
    expect(telegramMarkupToHtml("<b>и</b> **жирно**")).toBe(
      "&lt;b&gt;и&lt;/b&gt; <b>жирно</b>",
    );
  });
  it("пустая пара знаков тегом не становится", () => {
    expect(telegramMarkupToHtml("** **")).not.toContain("<b>");
  });
});

describe("адрес главы", () => {
  it.each([
    ["4.06 KM", "4-06-km"],
    ["  1.01 ", "1-01"],
    ["Интерлюдия. Рыжие", "интерлюдия-рыжие"],
  ])("%s → %s", (id, slug) => expect(slugifyChapterId(id)).toBe(slug));
});

describe("имена", () => {
  it("лишние пробелы схлопываются, длина ограничена", () => {
    expect(normalizeDisplayName("  Эрин   Солстис ")).toBe("Эрин Солстис");
    expect(normalizeDisplayName("я".repeat(100))).toHaveLength(
      DISPLAY_NAME_MAX,
    );
  });
  it("ключ имени не зависит от регистра", () => {
    expect(displayNameKey("Эрин")).toBe(displayNameKey("ЭРИН"));
  });
  it("служебные и безликие имена узнаются", () => {
    expect(isStaffName("Admin")).toBe(true);
    expect(isGenericName("Гость")).toBe(true);
    expect(isGenericName("Эрин")).toBe(false);
  });
  it("имя из почты — часть до собаки", () => {
    expect(nameFromEmail("erin@inn.test")).toBe("erin");
    expect(nameFromEmail(null)).toBeFalsy();
  });
});

describe("подсчёт слов", () => {
  it("теги и сущности не слова, а «кто-то» — одно слово", () => {
    expect(countWords("<p>Кто-то&nbsp;пришёл <b>в</b> таверну.</p>")).toBe(4);
  });
});

describe("настройки читалки", () => {
  it("мусор превращается в настройки по умолчанию", () => {
    expect(normalizeReaderSettings("ерунда")).toEqual(DEFAULT_READER_SETTINGS);
  });
  it("числа приводятся к рамкам", () => {
    const s = normalizeReaderSettings({
      fontSize: 13,
      lineHeight: 9,
      width: 10,
    });
    expect(s.fontSize).toBe(DEFAULT_READER_SETTINGS.fontSize);
    expect(s.lineHeight).toBeLessThanOrEqual(2);
    expect(s.width).toBeGreaterThanOrEqual(50);
  });
});

describe("оповещение о главах", () => {
  const ch = (id: string) => ({ id, title: `Глава ${id}` });
  it("главы идут по номеру, а не по строке: 4.2 раньше 4.10", () => {
    expect(
      sortChaptersForNotification([ch("4.10"), ch("4.2"), ch("3.5")]).map(
        (c) => c.id,
      ),
    ).toEqual(["3.5", "4.2", "4.10"]);
  });
  it("одна глава — с названием и ссылкой", () => {
    expect(buildChapterNotification([ch("4.20")], "https://site")).toBe(
      "Добавлена новая глава — 4.20 «Глава 4.20»\nhttps://site",
    );
  });
  it("несколько — диапазонами по томам", () => {
    const text = buildChapterNotification(
      [ch("4.21"), ch("4.20"), ch("4.22"), ch("5.1")],
      "https://site",
    );
    expect(text).toContain("4.20-4.22");
    expect(text).toContain("5.1");
  });
  it("пустой список — пустая строка", () => {
    expect(buildChapterNotification([], "https://site")).toBe("");
  });
});
