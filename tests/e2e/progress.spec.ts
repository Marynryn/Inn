import { test, expect, open } from './helpers'
import { CHAPTERS, chapterUrl } from './fixtures'

/*
  Трекер прогресса. Главы в посеве — 40, 30 и 25 абзацев одинаковой длины,
  так что доли по словам считаются в уме: первая глава ≈ 42 % всего текста.
*/
test.describe('Прогресс чтения', () => {
  test('у глав посчитаны слова', async ({ page }) => {
    const list = await (await page.request.get('/api/chapters')).json()
    const [first, second] = [list.find((c: any) => c.id === '1.01'), list.find((c: any) => c.id === '1.02')]
    expect(first.wordCount).toBeGreaterThan(0)
    // 40 абзацев против 30 — слов ровно на треть больше.
    expect(first.wordCount / second.wordCount).toBeCloseTo(40 / 30, 1)
  })

  test('гость без закладки видит ноль и может прикинуть по любой главе', async ({ page }) => {
    await open(page, '/progress')
    await expect(page.getByRole('heading', { name: 'Прогресс чтения' })).toBeVisible()
    await expect(page.locator('.percent-num')).toHaveText('0')
    await expect(page.getByLabel('Дочитано до главы')).toHaveValue('')

    await page.getByLabel('Дочитано до главы').selectOption('1.01')
    // 40 из 95 абзацев.
    await expect(page.locator('.percent-num')).toHaveText('42')
    await expect(page.locator('.stat', { hasText: 'глава прочитано' })).toContainText('1')
    await expect(page.locator('.stat', { hasText: 'главы осталось' })).toContainText('2')
    await expect(page.getByText('Это прикидка')).toBeVisible()
    // Прикидка закладку не заводит.
    const bookmark = await page.evaluate(() => localStorage.getItem('tavern:lastReadChapter'))
    expect(bookmark).toBeNull()
  })

  test('по закладке считается само, прикидка её не двигает', async ({ page }) => {
    // Дочитать первую главу до конца — закладка и отметка «прочитано».
    await open(page, chapterUrl(CHAPTERS[0]!.id))
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tavern:readChapters'))).toContain('1.01')

    await open(page, '/progress')
    await expect(page.getByLabel('Дочитано до главы')).toHaveValue('')
    await expect(page.getByText('По закладке — 1.01')).toBeAttached()
    await expect(page.getByText('Глава 1.01 дочитана.')).toBeVisible()
    await expect(page.locator('.percent-num')).toHaveText('42')

    await page.getByLabel('Дочитано до главы').selectOption('2.01')
    await expect(page.locator('.percent-num')).toHaveText('100')
    await expect(page.getByText('Вы догнали перевод', { exact: false }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Вернуться к закладке' }).click()
    await expect(page.locator('.percent-num')).toHaveText('42')
    const bookmark = await page.evaluate(() => JSON.parse(localStorage.getItem('tavern:lastReadChapter') ?? 'null'))
    expect(bookmark?.id).toBe('1.01')

    // Главная показывает ту же цифру и ведёт на трекер.
    await open(page, '/')
    const line = page.getByRole('link', { name: /Прочитано 42 %/ })
    await expect(line).toBeVisible()
    await expect(line).toHaveAttribute('href', '/progress')
  })

  test('скорость и часы в день запоминаются', async ({ page }) => {
    await open(page, '/progress')
    await page.getByRole('button', { name: /Быстро/ }).click()
    await page.getByLabel('Часов в день').fill('2')
    await page.getByLabel('Часов в день').blur()

    await open(page, '/progress')
    await expect(page.getByRole('button', { name: /Быстро/ })).toHaveClass(/active/)
    await expect(page.getByLabel('Часов в день')).toHaveValue('2')
  })
})
