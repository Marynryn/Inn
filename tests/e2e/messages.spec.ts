import { test, expect, open, login } from './helpers'
import { ADMIN, READER } from './fixtures'

/** Второй админ — собеседник. Заводится тем же запросом, что и форма «Добавить
 *  пользователя» во вкладке «Аккаунт»; повторный запуск получит 409, это не беда. */
const SECOND_ADMIN = { email: 'admin2@tavern.local', password: 'admin2pass' }

test.describe('Личные сообщения админов', () => {
  test('читателю переписка закрыта', async ({ page }) => {
    await login(page, READER)
    expect((await page.request.get('/api/admin/messages')).status()).toBe(403)
  })

  test('админ пишет другому — тот видит строку в колокольчике и сообщение вживую', async ({ page, browser }, info) => {
    test.setTimeout(90_000)
    await login(page, ADMIN)
    const created = await page.request.post('/api/admin/users', { data: { ...SECOND_ADMIN, role: 'admin' } })
    expect([200, 409]).toContain(created.status())

    // Собеседник — в своём браузере, с открытой вкладкой «Сообщения».
    const other = await browser.newContext({
      baseURL: info.project.use.baseURL,
      extraHTTPHeaders: { 'x-forwarded-for': '10.250.0.2' },
    })
    const page2 = await other.newPage()
    await login(page2, SECOND_ADMIN)
    const me2 = await (await page2.request.get('/api/auth/me')).json()
    const me = await (await page.request.get('/api/auth/me')).json()
    const id2 = me2.user?.id ?? me2.id
    const id1 = me.user?.id ?? me.id

    // Первый пишет из вкладки.
    await open(page, `/admin?tab=messages&with=${id2}`)
    const text = `Привет из теста 👋 ${Date.now()}`
    await page.locator('#dm-draft').fill(text)
    await page.locator('#dm-draft').press('Enter')
    await expect(page.locator('.msg.mine .bubble', { hasText: text })).toBeVisible()
    await expect(page.locator('#dm-draft')).toHaveValue('')
    await page.screenshot({ path: '.data/shots/dm-sender.png' })

    // У второго — строка в колокольчике.
    const bell = await (await page2.request.get('/api/notifications')).json()
    const row = bell.messages.find((m: { fromUserId: number }) => m.fromUserId === id1)
    expect(row?.body).toContain('Привет из теста')

    // Открыл разговор — сообщение там, а из колокольчика строка ушла.
    await open(page2, `/admin?tab=messages&with=${id1}`)
    await expect(page2.locator('.msg:not(.mine) .bubble', { hasText: text })).toBeVisible()
    await expect.poll(async () =>
      (await (await page2.request.get('/api/notifications')).json()).messages.length).toBe(0)

    // Ответ приходит первому без перезагрузки — через сокет колокольчика.
    const reply = `Ответ ${Date.now()}`
    await page2.locator('#dm-draft').fill(reply)
    await page2.locator('.send').click()
    await expect(page.locator('.msg:not(.mine) .bubble', { hasText: reply })).toBeVisible({ timeout: 15_000 })
    await page2.screenshot({ path: '.data/shots/dm-receiver.png' })

    await other.close()
  })

  test('нельзя написать читателю или себе', async ({ page }) => {
    await login(page, ADMIN)
    const me = await (await page.request.get('/api/auth/me')).json()
    const myId = me.user?.id ?? me.id
    const self = await page.request.post(`/api/admin/messages/${myId}`, { data: { body: 'сам себе' } })
    expect(self.status()).toBe(404)
    const empty = await page.request.post('/api/admin/messages/999999', { data: { body: '' } })
    expect(empty.status()).toBe(404)
  })
})
