import { test, expect, open, login } from './helpers'
import type { Page } from '@playwright/test'
import { ADMIN, CHAPTERS, READER, chapterUrl, makeEpub } from './fixtures'

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

  test('интерлюдия, загруженная позже, встаёт в конец своего тома, и навигация видит её без перезагрузки', async ({ page }) => {
    await login(page, ADMIN)
    // Вкладка с главой открыта заранее: список глав в ней уже загружен.
    await open(page, chapterUrl('1.01'))

    // Посев: 1.01, 1.02, 2.01. Догружаем интерлюдию первого тома — она должна
    // встать после 1.02, а не после второго тома, как было бы по порядку
    // загрузки. По номеру её место не угадать, ориентир — только том.
    const late = { id: 'I.1.1', volume: 1, title: 'Интерлюдия' }
    const lateUrl = '/chapter/i-1-1'
    const upload = await page.request.post('/api/admin/chapters', {
      multipart: {
        id: late.id,
        title: late.title,
        volume: String(late.volume),
        publishedAt: '2026-02-01',
        isPublished: '1',
        epub: { name: `${late.id}.epub`, mimeType: 'application/epub+zip', buffer: await makeEpub(late.title, 5) },
      },
    })
    expect(upload.ok(), await upload.text()).toBeTruthy()

    try {
      const list = await (await page.request.get('/api/chapters')).json()
      expect(list.map((c: any) => c.id)).toEqual(['1.01', '1.02', late.id, '2.01'])

      // Переход по ссылке, не перезагрузка: список должен подтянуться заново.
      const nav = page.locator('.reader-nav')
      await nav.getByRole('link', { name: '1.02 →' }).click()
      await expect(page).toHaveURL(chapterUrl('1.02'))
      await expect(nav.getByRole('link', { name: `${late.id} →` })).toHaveAttribute('href', lateUrl)

      await nav.getByRole('link', { name: `${late.id} →` }).click()
      await expect(page).toHaveURL(lateUrl)
      await expect(nav.getByRole('link', { name: '← 1.02' })).toHaveAttribute('href', chapterUrl('1.02'))
      await expect(nav.getByRole('link', { name: '2.01 →' })).toHaveAttribute('href', chapterUrl('2.01'))
    } finally {
      await page.request.delete(`/api/admin/chapters/${encodeURIComponent(late.id)}`)
    }
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

  test('плитка «Просмотров сегодня» раскрывается списком глав', async ({ page }) => {
    // Просмотр засчитывает сама страница главы, а не серверный рендер, — поэтому
    // сначала читаем главу и дожидаемся запроса, иначе список будет пустым.
    await open(page, chapterUrl(CHAPTERS[0].id))
    await page.waitForResponse(r => r.url().includes('/view') && r.ok())

    await login(page, ADMIN)
    await open(page, '/admin')
    await page.locator('.sb-tab', { hasText: 'Статистика' }).click()
    await page.locator('.stat-card--open', { hasText: 'Просмотров сегодня' }).click()

    const dialog = page.getByRole('dialog', { name: 'Просмотры сегодня' })
    await expect(dialog).toBeVisible()
    const row = dialog.locator('.row', { hasText: CHAPTERS[0].title })
    await expect(row.locator('.row-id')).toHaveText(CHAPTERS[0].id)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('плитка «Скачиваний epub» раскрывается списком скачиваний за сегодня', async ({ page }) => {
    // Скачивает гость: свои скачивания администратора в дневной список не идут.
    const dl = await page.request.get(`/api/chapters/${encodeURIComponent(CHAPTERS[1]!.id)}/download`)
    expect(dl.ok()).toBeTruthy()

    await login(page, ADMIN)
    await open(page, '/admin')
    await page.locator('.sb-tab', { hasText: 'Статистика' }).click()
    await page.locator('.stat-card--open', { hasText: 'Скачиваний epub' }).click()

    const dialog = page.getByRole('dialog', { name: 'Скачивания сегодня' })
    await expect(dialog).toBeVisible()
    const row = dialog.locator('.row', { hasText: CHAPTERS[1]!.title })
    await expect(row.locator('.row-id')).toHaveText(CHAPTERS[1]!.id)
    await expect(row.locator('.row-num')).toHaveText('1')

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('плитка «Комментариев» раскрывается списком последних', async ({ page }) => {
    const text = `Свежий отзыв ${Date.now()}`
    const posted = await page.request.post('/api/comments', {
      data: { chapterId: CHAPTERS[0]!.id, authorName: 'Гость статистики', body: text },
    })
    expect(posted.ok(), await posted.text()).toBeTruthy()

    await login(page, ADMIN)
    await open(page, '/admin')
    await page.locator('.sb-tab', { hasText: 'Статистика' }).click()
    await page.locator('.stat-card--open', { hasText: 'Комментариев' }).click()

    const dialog = page.getByRole('dialog', { name: 'Последние комментарии' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.row', { hasText: text })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // Отдельной вкладки в меню больше нет — список живёт только в окне.
    await expect(page.locator('.sb-tab', { hasText: 'Комментарии' })).toHaveCount(0)
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
