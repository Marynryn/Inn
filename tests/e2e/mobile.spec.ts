import { test, expect, open } from './helpers'
import { CHAPTERS, chapterUrl } from './fixtures'

/*
  Телефон. Проект «mobile» в конфиге подставляет Pixel 7 — узкий экран, тач.
  Здесь проверяется то, что на десктопе не видно: бургер, выпадающее меню и
  что ни одна страница не уезжает вбок.
*/
test.describe('Телефон', () => {
  test('бургер открывает меню с нужными пунктами', async ({ page }) => {
    await open(page, '/')
    const burger = page.getByRole('button', { name: 'Меню' })
    await expect(burger).toBeVisible()
    await burger.click()

    const menu = page.locator('.mobile-menu.open')
    await expect(menu).toBeVisible()
    for (const item of ['Главы', 'Игра', 'О проекте', 'Войти']) {
      await expect(menu.getByRole('link', { name: item })).toBeVisible()
    }

    await menu.getByRole('link', { name: 'Игра' }).click()
    await expect(page).toHaveURL(/\/game$/)
  })

  for (const url of ['/', chapterUrl(CHAPTERS[0]!.id), `${chapterUrl(CHAPTERS[0]!.id)}/comments`, '/game', '/progress', '/login', '/about']) {
    test(`страница ${url} не прокручивается по горизонтали`, async ({ page }) => {
      await open(page, url)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }

  test('текст главы читается: шрифт не мельче 15px', async ({ page }) => {
    await open(page, chapterUrl(CHAPTERS[0]!.id))
    const size = await page.locator('.reader-content p').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))
    expect(size).toBeGreaterThanOrEqual(15)
  })

  /*
    Настройки вида одни на все устройства: их выбирают за большим экраном, а
    читают потом с телефона. Здесь проверяется, что самый крупный кегль не
    превращает главу в четыре слова на строку и не роняет вёрстку.
  */
  test('крупные настройки с большого экрана не ломают главу', async ({ page, context }) => {
    await context.addInitScript(
      v => localStorage.setItem('tavern:reader', v),
      JSON.stringify({ theme: 'dark', fontSize: 24, lineHeight: 2, width: 100 }),
    )
    await open(page, chapterUrl(CHAPTERS[0]!.id))

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    const size = (sel: string) =>
      page.locator(sel).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))

    // Кегль ужат до доли ширины окна, но не ниже прежних 17px.
    const text = await size('.reader-content p')
    expect(text).toBeGreaterThan(17)
    expect(text).toBeLessThan(26)

    // Заголовок главы всегда крупнее её текста — иначе страница выглядит сломанной.
    expect(await size('.reader h1')).toBeGreaterThan(text)

    // Ширину на телефоне не настраивают: колонка и так во всё окно.
    await page.getByRole('button', { name: 'Настройки вида' }).click()
    const dialog = page.getByRole('dialog', { name: 'Настройки' })
    await expect(dialog.getByRole('button', { name: 'Текст', exact: true })).toBeVisible()
    await expect(dialog.getByLabel(/Ширина/)).toBeHidden()
  })
})
