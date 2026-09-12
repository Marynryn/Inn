import { test, expect, open, login } from './helpers'
import { ADMIN, CHAPTERS, READER, SECOND, chapterUrl } from './fixtures'

/*
  Находки исследователя от 12 сентября 2026 — каждая закреплена сценарием,
  чтобы не вернулась. Номера — как в отчёте .data/explorer-report.md того дня.
*/
const discussionUrl = `${chapterUrl(CHAPTERS[0]!.id)}/comments`
const stamp = () => Math.random().toString(36).slice(2, 8)

test.describe('Находки исследователя', () => {
  test('№1: комментарий и закладка в несуществующей главе отклоняются', async ({ page }) => {
    const orphan = await page.request.post('/api/comments', {
      data: { authorName: 'Гость', body: 'в пустоту', chapterId: '9.99' },
    })
    expect(orphan.status()).toBe(404)

    await login(page, READER)
    const progress = await page.request.post('/api/progress', { data: { chapterId: '9.99', read: true } })
    expect(progress.status()).toBe(404)

    // Перенос из браузера мусор молча пропускает, а настоящее берёт.
    const merge = await page.request.post('/api/progress/merge', {
      data: { read: ['9.99', CHAPTERS[1]!.id], scroll: { '8.88': 0.5 } },
    })
    expect(merge.ok()).toBeTruthy()
    const mine = await (await page.request.get('/api/progress')).json()
    expect(mine.read).toContain(CHAPTERS[1]!.id)
    expect(mine.read).not.toContain('9.99')
    expect(Object.keys(mine.scroll)).not.toContain('8.88')
  })

  test('№2 и №7: уведомление ведёт к самому ответу, цитата не рвётся посреди слова', async ({ browser, page }) => {
    await login(page, SECOND)
    await open(page, discussionUrl)
    const section = page.locator('.comments-section')
    // Длиннее 60 символов — чтобы выдержке было что обрезать.
    const rootText = `Трактирщица в этой главе явно что-то недоговаривает про гостя, который зашёл в самом конце ${stamp()}`
    await section.getByPlaceholder('Что думаешь об этой главе?').fill(rootText)
    await section.getByRole('button', { name: 'Отправить' }).click()
    await expect(section.locator('.comment-item', { hasText: rootText })).toBeVisible()

    const other = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.8.8.8' } })
    const reader = await other.newPage()
    await login(reader, READER)
    await open(reader, discussionUrl)
    const thread = reader.locator('.comment-thread', { hasText: rootText })
    await thread.getByRole('button', { name: 'Ответить' }).first().click()
    const replyText = `Недоговаривает, и это к лучшему ${stamp()}`
    await thread.getByPlaceholder('Напиши ответ...').fill(replyText)
    await thread.locator('.reply-form').getByRole('button', { name: 'Ответить' }).click()
    await expect(thread.locator('.comment-item.is-reply', { hasText: replyText })).toBeVisible()
    await other.close()

    // Выдержка своего комментария: по слову и с многоточием, не «…Мне кажется, э».
    const list = await (await page.request.get('/api/notifications')).json()
    const item = list.items.find((n: any) => n.body === replyText)
    expect(item).toBeTruthy()
    expect(item.answeredBody.endsWith('…')).toBeTruthy()
    expect(item.answeredBody.length).toBeLessThanOrEqual(61)
    expect(rootText.startsWith(item.answeredBody.slice(0, -1))).toBeTruthy()
    expect(rootText.charAt(item.answeredBody.length - 1)).toBe(' ')

    // Клик по уведомлению: чистый slug, якорь на ответ, ответ подсвечен и на экране.
    await open(page, '/')
    await page.locator('.notif-widget .orb-btn').click()
    await page.getByRole('dialog', { name: 'Уведомления' }).getByRole('button', { name: new RegExp(replyText.slice(0, 20)) }).click()
    await expect(page).toHaveURL(new RegExp(`${discussionUrl}#comment-${item.commentId}$`))
    const target = page.locator(`#comment-${item.commentId}`)
    await expect(target).toHaveClass(/is-target/)
    await expect(target).toBeInViewport()
  })

  test('№3: страница с комментариями гидрируется без предупреждений', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') errors.push(msg.text()) })
    await open(page, '/')
    await open(page, discussionUrl)
    expect(errors.filter(e => /hydration/i.test(e))).toEqual([])
  })

  test('№4: читателя с /admin разворачивают на сервере, каркас панели не отдаётся', async ({ page }) => {
    await login(page, READER)
    const res = await page.request.get('/admin', { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(res.headers()['location']).toMatch(/^\/login\?pw=1&next=(%2F|\/)admin$/)
    expect(await res.text()).not.toContain('Загрузить главу')

    // Гостю — то же самое.
    const guest = await page.context().browser()!.newContext()
    const g = await (await guest.newPage()).request.get('/admin', { maxRedirects: 0 })
    expect(g.status()).toBe(302)
    await guest.close()

    // А администратора пускают — и по прямой ссылке, и после входа с next=.
    await login(page, ADMIN)
    const ok = await page.request.get('/admin', { maxRedirects: 0 })
    expect(ok.status()).toBe(200)
    expect(await ok.text()).toContain('Загрузить главу')
  })

  test('№5: несколько кликов подряд по «Отправить» дают один комментарий', async ({ page }) => {
    await login(page, READER)
    await open(page, discussionUrl)
    const section = page.locator('.comments-section')
    const text = `Один раз, не три ${stamp()}`
    await section.getByPlaceholder('Что думаешь об этой главе?').fill(text)
    // Три клика в одном тике — до того, как реактивный disabled успеет перерисоваться.
    await section.locator('.comment-form .btn-send').evaluate((b: HTMLButtonElement) => { b.click(); b.click(); b.click() })
    await expect(section.locator('.comment-item', { hasText: text })).toHaveCount(1)
    await page.waitForTimeout(1000)
    await expect(section.locator('.comment-item', { hasText: text })).toHaveCount(1)
    const all = await (await page.request.get(`/api/comments?chapterId=${CHAPTERS[0]!.id}`)).json()
    expect(all.filter((c: any) => c.body === text)).toHaveLength(1)
  })

  test('№6: после выхода закладка не достаётся следующему за экраном', async ({ page }) => {
    await login(page, READER)
    await open(page, chapterUrl(CHAPTERS[0]!.id))
    await open(page, '/')
    // Какая именно глава — неважно (серверная закладка того же читателя могла
    // остаться от соседнего теста); важно, что закладка есть, а после выхода — нет.
    await expect(page.getByRole('link', { name: /Продолжить главу/ })).toBeVisible()

    await open(page, '/profile')
    await page.getByRole('button', { name: 'Выйти' }).click()
    await expect(page.locator('header').getByRole('link', { name: 'Войти' }).first()).toBeVisible()

    await open(page, '/')
    await expect(page.getByRole('link', { name: 'Читать с начала' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Продолжить главу/ })).toHaveCount(0)
    const leftovers = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('tavern:')))
    expect(leftovers).toEqual([])
  })

  test('№8: время комментариев в панели — московское', async ({ page }) => {
    await login(page, ADMIN)
    const text = `Который час ${stamp()}`
    const res = await page.request.post('/api/comments', { data: { body: text, chapterId: CHAPTERS[0]!.id } })
    expect(res.ok()).toBeTruthy()
    const created = new Date((await res.json()).createdAt.replace(' ', 'T') + 'Z')
    const expected = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(created)

    await open(page, '/admin')
    await page.getByRole('button', { name: 'Комментарии' }).click()
    const row = page.locator('.log-item', { hasText: text })
    await expect(row.locator('.log-time')).toHaveText(expected)
  })
})
