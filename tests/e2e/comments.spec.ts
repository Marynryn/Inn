import { test, expect, open, login } from "./helpers";
import { ADMIN, CHAPTERS, READER, SECOND, chapterUrl } from "./fixtures";

const discussionUrl = `${chapterUrl(CHAPTERS[0]!.id)}/comments`;
const stamp = () => Math.random().toString(36).slice(2, 8);

test.describe("Комментарии", () => {
  test("гость пишет под своим именем, и комментарий приходит без перезагрузки", async ({
    page,
  }) => {
    await open(page, discussionUrl);
    const section = page.locator(".comments-section");
    const text = `Гостевой отзыв ${stamp()}`;

    await section.getByPlaceholder("Твоё имя").fill("Прохожий");
    await section.getByPlaceholder("Что думаешь об этой главе?").fill(text);
    await section.getByRole("button", { name: "Отправить" }).click();

    // Список обновляется по вебсокету — страницу не перезагружаем.
    const item = section.locator(".comment-item", { hasText: text });
    await expect(item).toBeVisible();
    await expect(item.locator(".comment-name")).toHaveText("Прохожий");
    await expect(
      section.getByPlaceholder("Что думаешь об этой главе?"),
    ).toHaveValue("");
  });

  test("сокет переподключается после разрыва и дочитывает пропущенное", async ({
    page,
    playwright,
  }, info) => {
    // Второе соединение ничего не пересылает со стороны сервера: пропущенный
    // комментарий тогда может появиться только из перечитанного списка.
    let connections = 0;
    let first: { close: () => Promise<void> } | null = null;
    await page.routeWebSocket(/\/_ws\?chapterId=/, (ws) => {
      connections++;
      const server = ws.connectToServer();
      if (connections === 1) first = ws;
      else server.onMessage(() => {});
    });

    await open(page, discussionUrl);
    await expect.poll(() => connections).toBe(1);

    // Связь рвётся (деплой, смена сети на телефоне)…
    await first!.close();

    // …и пока её нет, кто-то пишет.
    const text = `Пока связи не было ${stamp()}`;
    const other = await playwright.request.newContext({
      baseURL: info.project.use.baseURL,
      extraHTTPHeaders: { "x-forwarded-for": "10.240.0.9" },
    });
    const posted = await other.post("/api/comments", {
      data: { chapterId: CHAPTERS[0]!.id, body: text, authorName: "" },
    });
    expect(posted.ok()).toBe(true);
    await other.dispose();

    await expect.poll(() => connections, { timeout: 10_000 }).toBe(2);
    await expect(
      page.locator(".comments-section .comment-item", { hasText: text }),
    ).toBeVisible();
  });

  test("кнопка «Обсуждение главы» показывает число комментариев", async ({
    page,
  }) => {
    const id = CHAPTERS[0]!.id;
    const before = (
      await (
        await page.request.get(
          `/api/comments?chapterId=${encodeURIComponent(id)}`,
        )
      ).json()
    ).length;

    await open(page, discussionUrl);
    const section = page.locator(".comments-section");
    await section.getByPlaceholder("Твоё имя").fill("Счетовод");
    await section
      .getByPlaceholder("Что думаешь об этой главе?")
      .fill(`Плюс один ${stamp()}`);
    await section.getByRole("button", { name: "Отправить" }).click();
    await expect(
      section.locator(".comment-item", { hasText: "Плюс один" }).first(),
    ).toBeVisible();

    await open(page, chapterUrl(id));
    await expect(page.locator(".comments-cta-btn")).toContainText(
      `(${before + 1})`,
    );

    // У главы без комментариев скобок нет вовсе.
    await open(page, chapterUrl(CHAPTERS[2]!.id));
    await expect(page.locator(".comments-cta-btn")).not.toContainText("(");
  });

  test("гость не может подписаться именем читателя", async ({ page }) => {
    await open(page, discussionUrl);
    const section = page.locator(".comments-section");
    await section.getByPlaceholder("Твоё имя").fill(READER.name);
    await section
      .getByPlaceholder("Что думаешь об этой главе?")
      .fill(`Самозванец ${stamp()}`);
    await section.getByRole("button", { name: "Отправить" }).click();
    await expect(section.locator(".comment-error")).toContainText("Имя занято");
  });

  test("пустой комментарий отправить нельзя", async ({ page }) => {
    await open(page, discussionUrl);
    const section = page.locator(".comments-section");
    await expect(
      section.getByRole("button", { name: "Отправить" }),
    ).toBeDisabled();
    await section.getByPlaceholder("Что думаешь об этой главе?").fill("   ");
    await expect(
      section.getByRole("button", { name: "Отправить" }),
    ).toBeDisabled();
  });

  test("читатель подписывается автоматически, спойлер скрыт до клика", async ({
    page,
  }) => {
    await login(page, READER);
    await open(page, discussionUrl);
    const section = page.locator(".comments-section");
    const text = `Спойлер про козла ${stamp()}`;

    // У вошедшего поля «имя» нет — подпись берётся из профиля.
    await expect(section.getByPlaceholder("Твоё имя")).toHaveCount(0);
    await section.getByPlaceholder("Что думаешь об этой главе?").fill(text);
    await section.getByLabel("Содержит спойлер").check();
    await section.getByRole("button", { name: "Отправить" }).click();

    const item = section.locator(".comment-item", { hasText: text });
    await expect(item.locator(".comment-name")).toHaveText(READER.name);
    await expect(item.locator(".spoiler-badge")).toBeVisible();
    await expect(item.locator(".comment-body")).toHaveClass(/is-spoiler/);
    await item.locator(".comment-body").click();
    await expect(item.locator(".comment-body")).not.toHaveClass(/is-spoiler/);
  });

  test("ответ приходит автору уведомлением", async ({ browser, page }) => {
    // SECOND пишет комментарий...
    await login(page, SECOND);
    await open(page, discussionUrl);
    const section = page.locator(".comments-section");
    const rootText = `Кто-нибудь понял концовку? ${stamp()}`;
    await section.getByPlaceholder("Что думаешь об этой главе?").fill(rootText);
    await section.getByRole("button", { name: "Отправить" }).click();
    const root = section.locator(".comment-thread", { hasText: rootText });
    await expect(root).toBeVisible();

    // ...READER отвечает из другого браузера...
    const other = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": "10.9.9.9" },
    });
    const reader = await other.newPage();
    await login(reader, READER);
    await open(reader, discussionUrl);
    const thread = reader.locator(".comment-thread", { hasText: rootText });
    await thread.getByRole("button", { name: "Ответить" }).first().click();
    const replyText = `Понял, но не скажу ${stamp()}`;
    await thread.getByPlaceholder("Напиши ответ...").fill(replyText);
    await thread
      .locator(".reply-form")
      .getByRole("button", { name: "Ответить" })
      .click();
    await expect(
      thread.locator(".comment-item.is-reply", { hasText: replyText }),
    ).toBeVisible();
    await other.close();

    // ...а у SECOND ответ появляется в ветке и в колокольчике.
    await expect(
      root.locator(".comment-item.is-reply", { hasText: replyText }),
    ).toBeVisible();
    await expect(page.locator(".notif-widget .badge")).toHaveText(/[1-9]/);
    const list = await (await page.request.get("/api/notifications")).json();
    expect(list.unread).toBeGreaterThan(0);
  });

  test("лайк приходит автору уведомлением, а снять и поставить снова — не новость", async ({
    browser,
    page,
  }) => {
    // SECOND пишет комментарий...
    await login(page, SECOND);
    await open(page, discussionUrl);
    const section = page.locator(".comments-section");
    const text = `Лучшая глава тома ${stamp()}`;
    await section.getByPlaceholder("Что думаешь об этой главе?").fill(text);
    await section.getByRole("button", { name: "Отправить" }).click();
    await expect(
      section.locator(".comment-item", { hasText: text }),
    ).toBeVisible();
    await page.request.post("/api/notifications/read");

    // ...READER лайкает его из другого браузера...
    const other = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": "10.9.9.8" },
    });
    const reader = await other.newPage();
    await login(reader, READER);
    await open(reader, discussionUrl);
    const like = reader
      .locator(".comment-item", { hasText: text })
      .locator(".reaction-btn")
      .first();
    await like.click();
    await expect(like).toHaveClass(/active/);

    // ...и у SECOND в колокольчике одна строка про лайк.
    await expect(page.locator(".notif-widget .badge")).toHaveText(/[1-9]/);
    const likesOf = async () =>
      (
        await (await page.request.get("/api/notifications")).json()
      ).items.filter(
        (n: { type: string; body: string }) =>
          n.type === "like" && n.body.includes(text),
      );
    const [item] = await likesOf();
    expect(item.likes).toBe(1);
    expect(item.authorName).toBeTruthy();

    await page.locator(".notif-widget .orb-btn").click();
    await expect(
      page.locator(".notif-widget .item", {
        hasText: "ставит лайк твоему комментарию",
      }),
    ).toBeVisible();

    // Прочитал — READER снимает лайк и ставит снова: второй раз не уведомляем.
    await page.request.post("/api/notifications/read");
    await like.click();
    await expect(like).not.toHaveClass(/active/);
    await like.click();
    await expect(like).toHaveClass(/active/);
    await other.close();

    expect(await likesOf()).toHaveLength(0);
  });

  test("реакция ставится один раз и снимается повторным кликом", async ({
    page,
  }) => {
    await open(page, discussionUrl);
    const item = page.locator(".comment-item").first();
    const like = item.locator(".reaction-btn").first();
    const before = Number((await like.innerText()).replace(/\D/g, "") || 0);

    await like.click();
    await expect(like).toHaveClass(/active/);
    await expect(like).toHaveText(new RegExp(String(before + 1)));

    await like.click();
    await expect(like).not.toHaveClass(/active/);
  });

  test("два гостя за одним IP не видят реакций друг друга", async ({
    browser,
  }) => {
    // Один адрес на двоих — как у мобильного оператора или офиса.
    const sameIp = { extraHTTPHeaders: { "x-forwarded-for": "10.7.7.7" } };
    const first = await browser.newContext(sameIp);
    const second = await browser.newContext(sameIp);
    const a = await first.newPage();
    const b = await second.newPage();

    try {
      await open(a, discussionUrl);
      const likeA = a
        .locator(".comment-item")
        .first()
        .locator(".reaction-btn")
        .first();
      await likeA.click();
      await expect(likeA).toHaveClass(/active/);

      // Свой лайк первый гость видит и после перезагрузки — по своей куке.
      await open(a, discussionUrl);
      await expect(likeA).toHaveClass(/active/);

      // Второй гость с того же IP своим его не считает.
      await open(b, discussionUrl);
      const likeB = b
        .locator(".comment-item")
        .first()
        .locator(".reaction-btn")
        .first();
      await expect(likeB).toHaveText(await likeA.innerText());
      await expect(likeB).not.toHaveClass(/active/);
      const mine = await (
        await b.request.get(
          `/api/comments/reactions?chapterId=${encodeURIComponent(CHAPTERS[0]!.id)}`,
        )
      ).json();
      expect(mine).toEqual({});

      // Снимаем за собой.
      await likeA.click();
      await expect(likeA).not.toHaveClass(/active/);
    } finally {
      await first.close();
      await second.close();
    }
  });

  test("серверный HTML обсуждения не зависит от того, кто его смотрит", async ({
    browser,
    page,
  }) => {
    const listUrl = `/api/comments?chapterId=${encodeURIComponent(CHAPTERS[0]!.id)}`;

    await login(page, READER);
    await open(page, discussionUrl);
    const like = page
      .locator(".comment-item")
      .first()
      .locator(".reaction-btn")
      .first();
    await like.click();
    await expect(like).toHaveClass(/active/);

    try {
      const guest = await browser.newContext();
      // Список комментариев у читателя с лайком и у гостя совпадает байт в
      // байт: своей реакции в нём нет, только общие счётчики.
      const asReader = await (await page.request.get(listUrl)).text();
      const asGuest = await (await guest.request.get(listUrl)).text();
      expect(asReader).toBe(asGuest);
      expect(asReader).not.toContain("myReaction");

      // И в HTML страницы, который отдаёт сервер, лайк читателя не подсвечен.
      const html = await (await page.request.get(discussionUrl)).text();
      expect(html).toContain("reaction-btn");
      expect(html).not.toMatch(/class="reaction-btn active"/);
      await guest.close();
    } finally {
      await like.click();
      await expect(like).not.toHaveClass(/active/);
    }
  });

  test("администратор удаляет комментарий", async ({ page }) => {
    await login(page, ADMIN);
    await open(page, discussionUrl);
    const section = page.locator(".comments-section");
    const text = `На удаление ${stamp()}`;
    await section.getByPlaceholder("Что думаешь об этой главе?").fill(text);
    await section.getByRole("button", { name: "Отправить" }).click();
    const item = section.locator(".comment-item", { hasText: text });
    await expect(item).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await item.getByRole("button", { name: "Удалить" }).click();
    await expect(item).toHaveCount(0);
  });

  test("отзыв о проекте на главной попадает в список", async ({ page }) => {
    await open(page, "/");
    const section = page.locator("#reviews .comments-section");
    const text = `Спасибо за перевод ${stamp()}`;
    await section.getByPlaceholder("Что думаешь о проекте?").fill(text);
    await section.getByRole("button", { name: "Отправить" }).click();
    await expect(
      section.locator(".comment-item", { hasText: text }),
    ).toBeVisible();
    await expect(
      section
        .locator(".comment-item", { hasText: text })
        .locator(".comment-name"),
    ).toHaveText("Гость");
  });
});
