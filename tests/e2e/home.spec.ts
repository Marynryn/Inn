import { test, expect, open } from './helpers'
import { CHAPTERS, chapterUrl } from './fixtures'

test.describe('Главная', () => {
  test('оглавление показывает тома и ведёт к главе', async ({ page }) => {
    await open(page, '/')
    await expect(page).toHaveTitle(/Странствующая Таверна/)
    await expect(page.getByRole('heading', { name: 'Оглавление' })).toBeVisible()

    // Оба тома на месте, последний раскрыт по умолчанию.
    const vol1 = page.locator('.volume', { hasText: 'Том 1' })
    const vol2 = page.locator('.volume', { hasText: 'Том 2' })
    await expect(vol1).toBeVisible()
    await expect(vol2).toHaveClass(/open/)
    await expect(vol2.getByText('Новый том')).toBeVisible()

    // Первый том свёрнут: раскрываем и идём в главу.
    await vol1.locator('.volume-head').click()
    await expect(vol1).toHaveClass(/open/)
    const first = CHAPTERS[0]!
    await vol1.getByRole('link', { name: new RegExp(first.title) }).click()
    await expect(page).toHaveURL(new RegExp(chapterUrl(first.id)))
    await expect(page.getByRole('heading', { level: 1, name: first.title })).toBeVisible()
  })

  test('на главной есть отзывы о проекте и форма для них', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByRole('heading', { name: 'Отзывы о проекте' })).toBeVisible()
    await expect(page.getByPlaceholder('Что думаешь о проекте?')).toBeVisible()
  })

  test('главная не прокручивается по горизонтали', async ({ page }) => {
    await open(page, '/')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
