import { test, expect, open } from './helpers'
import { CHAPTERS, chapterUrl } from './fixtures'

test.describe('Чтение главы', () => {
  test('глава открывается целиком, с навигацией между соседями', async ({ page }) => {
    const [first, second, third] = CHAPTERS as [typeof CHAPTERS[0], typeof CHAPTERS[0], typeof CHAPTERS[0]]
    await open(page, chapterUrl(second.id))

    await expect(page.getByRole('heading', { level: 1, name: second.title })).toBeVisible()
    await expect(page.locator('.reader-eyebrow')).toContainText(`Том ${second.volume} · Глава ${second.id}`)
    // Все абзацы из epub добрались до страницы, разметка не потерялась.
    await expect(page.locator('.reader-content p')).toHaveCount(second.paragraphs)
    await expect(page.locator('.reader-content em').first()).toBeVisible()

    const nav = page.locator('.reader-nav')
    await expect(nav.getByRole('link', { name: `← ${first.id}` })).toHaveAttribute('href', chapterUrl(first.id))
    await expect(nav.getByRole('link', { name: `${third.id} →` })).toHaveAttribute('href', chapterUrl(third.id))
  })

  test('у первой главы нет ссылки назад, у последней — вперёд', async ({ page }) => {
    await open(page, chapterUrl(CHAPTERS[0]!.id))
    await expect(page.locator('.reader-nav a')).toHaveCount(1)

    await open(page, chapterUrl(CHAPTERS.at(-1)!.id))
    await expect(page.locator('.reader-nav a')).toHaveCount(1)
  })

  test('старый адрес с точкой ведёт на чистый slug', async ({ page }) => {
    const res = await page.request.get('/chapter/1.01', { maxRedirects: 0 })
    expect(res.status()).toBe(301)
    expect(res.headers()['location']).toBe('/chapter/1-01')
  })

  test('просмотр читателя засчитывается', async ({ page }) => {
    const id = CHAPTERS[0]!.id
    const before = await (await page.request.get('/api/chapters')).json()
    const was = before.find((c: any) => c.id === id)?.viewsCount ?? 0

    await open(page, chapterUrl(id))
    await expect.poll(async () => {
      const list = await (await page.request.get('/api/chapters')).json()
      return list.find((c: any) => c.id === id)?.viewsCount ?? 0
    }).toBe(was + 1)
  })

  test('epub скачивается', async ({ page }) => {
    const res = await page.request.get(`/api/chapters/${encodeURIComponent(CHAPTERS[0]!.id)}/download`)
    expect(res.ok()).toBeTruthy()
    const body = await res.body()
    // Zip начинается с PK.
    expect(body.subarray(0, 2).toString()).toBe('PK')
  })

  test('несуществующая глава показывает 404', async ({ page }) => {
    const res = await page.goto('/chapter/9-99')
    expect(res?.status()).toBe(404)
    await expect(page).toHaveTitle(/404/)
    await expect(page.locator('.error-sub')).toBeVisible()
  })
})
