import { test, expect, open } from './helpers'

test.describe('Карты таверны', () => {
  test('отряд собирается, кубики перебрасываются, ход уходит сопернику и возвращается', async ({ page }) => {
    await open(page, '/cards')
    const start = page.getByRole('button', { name: 'В бой' })
    await expect(start).toBeDisabled()
    for (const name of ['Эрин', 'Сирия', 'Рэгс']) await page.locator('.pick', { hasText: name }).click()
    await expect(start).toBeEnabled()
    await start.click()

    await expect(page.locator('.die')).toHaveCount(8)
    await page.locator('.die').first().click()
    await page.getByRole('button', { name: 'Перебросить (1)' }).click()

    // «Конец раунда» — боевой ход: соперник доигрывает раунд, потом начинается второй.
    await expect(page.locator('.banner')).toHaveText('Твой ход')
    await page.getByRole('button', { name: 'Закончить раунд' }).click()
    await expect(page.locator('.round')).toHaveText('Раунд 2', { timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Оставить как есть' })).toBeVisible()
  })
})
