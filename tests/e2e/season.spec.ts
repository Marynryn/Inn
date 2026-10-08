import { test, expect, open, login } from './helpers'
import { ADMIN, CHAPTERS, chapterUrl } from './fixtures'

test.describe('Праздничное оформление', () => {
  test('администратор включает Хеллоуин — Торен встаёт вместо Аписты, и обратно', async ({ page }) => {
    // Главная, глава и панель — три тяжёлые страницы, и на холодном стенде
    // каждая собирается при первом заходе: в обычные 30 секунд не укладывается.
    test.setTimeout(90_000)
    await login(page, ADMIN)
    try {
      await open(page, '/admin?tab=settings')
      const select = page.locator('#season-theme')
      await expect(select).toHaveValue('')
      await select.selectOption('halloween')
      await page.screenshot({ path: '.data/shots/season-admin.png', fullPage: false })
      await page.getByRole('button', { name: /Сохранить/ }).first().click()
      await expect.poll(async () => (await (await page.request.get('/api/settings')).json()).season_theme).toBe('halloween')

      // Торен рисуется проигрывателем уже в браузере — ждём, пока в нём появится svg.
      await open(page, '/')
      await expect(page.locator('.ledger-toren .toren svg')).toBeVisible()
      await expect(page.locator('.ledger-bee')).toHaveCount(0)

      await open(page, chapterUrl(CHAPTERS[0]!.id))
      await expect(page.locator('.faint-leaves.halloween')).toHaveCount(1)
    } finally {
      // База одна на все тесты: оформление возвращаем, даже если проверка упала.
      await page.request.put('/api/admin/settings', { data: { season_theme: '' } })
    }

    await open(page, '/')
    await expect(page.locator('.ledger-bee')).toBeVisible()
    await expect(page.locator('.toren')).toHaveCount(0)
  })
})
