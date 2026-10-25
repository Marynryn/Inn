import { test, expect, open } from './helpers'
import { CHAPTERS, chapterUrl } from './fixtures'

/*
  Название сайта и книги вынесены в настройки (runtimeConfig.public.brand), чтобы
  тот же код мог работать демо-стендом или сайтом другой книги. Стенд тестов
  запущен без переопределений — значит, всюду должна остаться Таверна, а режим
  демо выключен.
*/
test.describe('Бренд по умолчанию и режим демо', () => {
  test('главная и глава подписаны Таверной, демо-плашки нет', async ({ page }) => {
    await open(page, '/')
    await expect(page).toHaveTitle('Странствующая Таверна — русский перевод The Wandering Inn')
    await expect(page.getByText('Фанатский перевод · The Wandering Inn')).toBeVisible()
    await expect(page.locator('.demo-banner')).toHaveCount(0)
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)

    const first = CHAPTERS[0]!
    await open(page, chapterUrl(first.id))
    await expect(page).toHaveTitle(`${first.title} — Странствующая Таверна, читать онлайн | The Wandering Inn`)
  })

  test('robots.txt открывает сайт поиску и ведёт к sitemap', async ({ page, baseURL }) => {
    const res = await page.request.get('/robots.txt')
    expect(res.status()).toBe(200)
    expect(await res.text()).toBe(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /login
Disallow: /api/

Sitemap: ${baseURL}/sitemap.xml
`)
  })

  test('игра и персонажи на месте — прячутся они только в демо', async ({ page }) => {
    expect((await page.request.get('/game')).status()).toBe(200)
    expect((await page.request.get('/characters')).status()).toBe(200)
  })
})
