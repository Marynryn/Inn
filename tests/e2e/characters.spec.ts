import { test, expect, open, login } from './helpers'
import { ADMIN } from './fixtures'

const SEARCH = 'Имя по-русски или в оригинале…'

test.describe('Карточки персонажей', () => {
  test('карточки видны сразу, поиск ищет и по-русски, и латиницей', async ({ page }) => {
    await open(page, '/characters')
    const cards = page.locator('.card')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(50)

    await page.getByPlaceholder(SEARCH).fill('erin')
    await expect(cards).toHaveCount(1)
    await expect(cards.first().locator('.name')).toHaveText('Эрин Солстис')

    await page.getByPlaceholder(SEARCH).fill('торен')
    await expect(cards.first().locator('.name')).toHaveText('Торен')
  })

  test('фильтр по расе сужает список, «Сбросить» возвращает всех', async ({ page }) => {
    await open(page, '/characters')
    const cards = page.locator('.card')
    const total = await cards.count()

    await page.locator('.filter select').nth(1).selectOption({ label: 'Гоблин' })
    const filtered = await cards.count()
    expect(filtered).toBeGreaterThan(0)
    expect(filtered).toBeLessThan(total)
    await expect(page.getByText(`Найдено: ${filtered}`)).toBeVisible()

    await page.getByRole('button', { name: 'Сбросить' }).click()
    await expect(cards).toHaveCount(total)
  })

  test('огонёк зажигается, гаснет и поднимает карточку в сортировке', async ({ page }) => {
    await open(page, '/characters')
    await page.getByPlaceholder(SEARCH).fill('Торен')
    const card = page.locator('.card').first()
    const flame = card.locator('.flame')

    await expect(flame.locator('.num')).toHaveText('0')
    await flame.click()
    await expect(flame).toHaveClass(/lit/)
    await expect(flame.locator('.num')).toHaveText('1')

    // Огонёк — единственный на странице: по огонькам Торен встаёт первым.
    await page.getByPlaceholder(SEARCH).fill('')
    await page.getByRole('button', { name: 'По огонькам' }).click()
    await expect(page.locator('.card').first().locator('.name')).toHaveText('Торен')

    await page.locator('.card').first().locator('.flame').click()
    await expect(page.locator('.card').first().locator('.flame .num')).toHaveText('0')
  })

  test('клик по карточке открывает её, Esc закрывает', async ({ page }) => {
    await open(page, '/characters')
    await page.getByPlaceholder(SEARCH).fill('Торен')
    await page.locator('.card').first().click()

    const dialog = page.getByRole('dialog', { name: 'Торен' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Нежить')).toBeVisible()
    await expect(dialog.getByText('Toren')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('админ прячет карточку, и читатель её не получает', async ({ page, browser }) => {
    await login(page, ADMIN)
    await open(page, '/characters')
    await page.getByPlaceholder(SEARCH).fill('Торен')
    const card = page.locator('.card').first()
    await card.locator('.hide-btn').click()
    await expect(card).toHaveClass(/hidden/)

    const guest = await browser.newContext()
    const res = await guest.request.get('/api/characters')
    const names = ((await res.json()).characters as { name: string }[]).map(c => c.name)
    expect(names).not.toContain('Торен')
    await guest.close()

    await card.locator('.hide-btn').click()
    await expect(card).not.toHaveClass(/hidden/)
  })
})
