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

  for (const url of ['/', chapterUrl(CHAPTERS[0]!.id), `${chapterUrl(CHAPTERS[0]!.id)}/comments`, '/game', '/login', '/about']) {
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
})
