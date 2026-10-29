import { test, expect, open, login } from './helpers'
import { ADMIN, READER } from './fixtures'

test.describe('Карты таверны', () => {
  test('против компьютера: отряд, переброс, ход уходит сопернику и возвращается', async ({ page }) => {
    // Компьютер доигрывает раунд с паузой между ходами, а первый тест ещё
    // ждёт, пока сервер соберёт страницы: 30 секунд впритык.
    test.setTimeout(60_000)
    await login(page, ADMIN)
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
    // Компьютер мог выбить активного героя за раунд — тогда сначала выбираем, кто выйдет.
    const choose = page.locator('.fighter--choose').first()
    if (await choose.isVisible()) await choose.click()
    await expect(page.getByRole('button', { name: 'Оставить как есть' })).toBeVisible()
  })

  test('против компьютера — пока только админам', async ({ page }) => {
    await login(page, READER)
    await page.goto('/cards')
    await expect(page).toHaveURL(/\/login/)
  })

  test('стол на двоих: админ накрывает, гость садится по ссылке, партия начинается', async ({ page, browser }) => {
    await login(page, ADMIN)
    await open(page, '/board')
    await page.getByRole('button', { name: 'Стол на двоих' }).click()
    await expect(page).toHaveURL(/\/cards\/[A-Z0-9]{6}$/)
    const url = page.url()

    const code = url.split('/').pop()!

    // Второй находит стол в «Открытых столах», а не только по ссылке.
    const guestCtx = await browser.newContext()
    const guest = await guestCtx.newPage()
    await open(guest, '/board')
    const listed = guest.locator('.room', { hasText: code })
    await expect(listed).toContainText('Карты таверны')
    await listed.getByRole('link', { name: 'Сесть за стол' }).click()
    await expect(guest).toHaveURL(new RegExp(`/cards/${code}$`))
    await guest.getByPlaceholder('Имя').fill('Гостья за картами')
    await guest.getByRole('button', { name: 'Сесть за стол' }).click()
    for (const name of ['Релк', 'Пишес', 'Рёка']) await guest.locator('.pick', { hasText: name }).click()
    await guest.getByRole('button', { name: 'Готов' }).click()

    for (const name of ['Эрин', 'Сирия', 'Рэгс']) await page.locator('.pick', { hasText: name }).click()
    await page.getByRole('button', { name: 'Готов' }).click()

    // Каждый видит себя снизу, а соперника — сверху, с его именем и без его карт.
    await expect(page.locator('.side--me .fighter-name').first()).toHaveText('Эрин')
    await expect(guest.locator('.side--me .fighter-name').first()).toHaveText('Релк')
    await expect(guest.locator('.side--foe .side-info')).toContainText('admin')

    // Оба перебрасывают кубики — и у одного из них ход.
    await page.getByRole('button', { name: 'Оставить как есть' }).click()
    await guest.getByRole('button', { name: 'Оставить как есть' }).click()
    await expect(page.locator('.banner')).toHaveText(/Твой ход|Ходит Гостья за картами/)

    // Чат за столом доходит до соперника.
    await guest.locator('.chat-input').fill('Привет из таверны')
    await guest.locator('.chat-input').press('Enter')
    await expect(page.locator('.msg-text', { hasText: 'Привет из таверны' })).toBeVisible()
    await guestCtx.close()
  })
})
