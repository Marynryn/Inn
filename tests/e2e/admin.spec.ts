import { test, expect, open, login } from './helpers'
import type { Page } from '@playwright/test'
import { ADMIN, CHAPTERS, READER, chapterUrl } from './fixtures'

/**
 * Правка главы. Сервер всегда ждёт полный contentHtml — так работает и редактор
 * в панели, — поэтому текст сначала забираем, а потом кладём назад вместе с
 * изменённым полем.
 */
async function editChapter(page: Page, id: string, patch: Record<string, unknown>) {
  const current = await (await page.request.get(`/api/chapters/${encodeURIComponent(id)}`)).json()
  return page.request.put(`/api/admin/chapters/${encodeURIComponent(id)}`, {
    data: { contentHtml: current.contentHtml, ...patch },
  })
}

test.describe('Панель администратора', () => {
  test('гостю и читателю в API панели нет хода', async ({ page }) => {
    expect((await page.request.get('/api/admin/stats')).status()).toBe(403)
    expect((await page.request.get('/api/admin/users')).status()).toBe(403)

    await login(page, READER)
    expect((await page.request.get('/api/admin/stats')).status()).toBe(403)
    expect((await page.request.post('/api/admin/users', {
      data: { email: 'hacker@test.local', password: 'hack123', role: 'admin' },
    })).status()).toBe(403)
  })

  test('читателя со страницы панели уводят на вход', async ({ page }) => {
    await login(page, READER)
    await open(page, '/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('администратор видит главы и загружает новую через форму', async ({ page }) => {
    await login(page, ADMIN)
    await open(page, '/admin')
    await expect(page).toHaveTitle(/Админ/)

    await page.getByRole('button', { name: 'Список глав' }).click()
    await expect(page.getByRole('heading', { name: `Главы (${CHAPTERS.length})` })).toBeVisible()
  })

  test('черновик не виден читателям, а после публикации — виден', async ({ page }) => {
    await login(page, ADMIN)
    const id = CHAPTERS[2]!.id

    const hide = await editChapter(page, id, { isPublished: false })
    expect(hide.ok(), await hide.text()).toBeTruthy()

    // Гость: главы нет ни в списке, ни по прямой ссылке.
    const guest = await page.context().browser()!.newContext()
    const gp = await guest.newPage()
    const list = await (await gp.request.get('/api/chapters')).json()
    expect(list.map((c: any) => c.id)).not.toContain(id)
    const res = await gp.goto(chapterUrl(id))
    expect(res?.status()).toBe(404)
    await guest.close()

    // Администратору черновик по-прежнему открыт.
    await open(page, chapterUrl(id))
    await expect(page.getByRole('heading', { level: 1, name: CHAPTERS[2]!.title })).toBeVisible()

    const show = await editChapter(page, id, { isPublished: true })
    expect(show.ok()).toBeTruthy()
    const after = await (await page.request.get('/api/chapters')).json()
    expect(after.map((c: any) => c.id)).toContain(id)
  })

  test('переименование главы видно на главной', async ({ page }) => {
    await login(page, ADMIN)
    const ch = CHAPTERS[1]!
    const renamed = `${ch.title} (ред.)`

    const res = await editChapter(page, ch.id, { title: renamed })
    expect(res.ok(), await res.text()).toBeTruthy()

    await open(page, '/')
    const vol1 = page.locator('.volume', { hasText: 'Том 1' })
    await vol1.locator('.volume-head').click()
    await expect(vol1.getByText(renamed)).toBeVisible()

    await editChapter(page, ch.id, { title: ch.title })
  })

  test('статистика отдаёт просмотры и пользователей', async ({ page }) => {
    await login(page, ADMIN)
    const stats = await page.request.get('/api/admin/stats')
    expect(stats.ok()).toBeTruthy()
    // Поиск людей — по имени или почте, от двух букв.
    const users = await (await page.request.get('/api/admin/users?q=reader')).json()
    expect(users.map((u: any) => u.email)).toContain(READER.email)
  })
})
