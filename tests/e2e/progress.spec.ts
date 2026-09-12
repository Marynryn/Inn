import { test, expect, open, apiLogin } from './helpers'
import { ADMIN, CHAPTERS, chapterUrl } from './fixtures'

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

test.describe('Прогресс относительно оригинала', () => {
  test('без числа глав оригинала карточки нет, с числом — считает доли', async ({ page, request }) => {
    // Стенд без интернета: число из InnWords не приедет, карточка молчит.
    await open(page, '/progress')
    await expect(page.getByRole('heading', { name: 'А если считать от всей книги' })).toHaveCount(0)

    // Админ задаёт число руками — 3 переведённых главы из 30.
    await apiLogin(request, ADMIN)
    const res = await request.put('/api/admin/settings', { data: { original_chapters_total: '30' } })
    expect(res.ok()).toBeTruthy()

    await open(page, '/progress')
    const card = page.locator('.original')
    await expect(card.getByRole('heading', { name: 'А если считать от всей книги' })).toBeVisible()
    await expect(card).toContainText('сейчас 30 глав')
    // Слов оригинала стенд не знает (нет интернета) — колонки слов нет.
    await expect(card.locator('th', { hasText: 'слов' })).toHaveCount(0)
    // Ячейки в тексте строки идут без пробела между ними.
    await expect(card.locator('.row-translated')).toHaveText(/переведено\s*3\s+10 %/)
    await expect(card.locator('.row-read')).toHaveText(/вы прочитали\s*0\s+0 %/)

    await page.getByLabel('Дочитано до главы').selectOption('1.01')
    await expect(card.locator('.row-read')).toHaveText(/вы прочитали\s*1\s+3 %/)

    await request.put('/api/admin/settings', { data: { original_chapters_total: '' } })
  })
})
