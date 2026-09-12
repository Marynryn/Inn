import type { Page } from '@playwright/test'
import { test, expect, open, login } from './helpers'
import { READER } from './fixtures'

/**
 * Назвать персонажа из подсказок. Список на странице зависит от потолка тома
 * партии, поэтому берём того, кого предлагает сама страница: набираем букву и
 * выбираем n-го из списка. Возвращает выбранное имя.
 */
async function guessNth(page: Page, n: number, letter = 'а'): Promise<string> {
  const input = page.getByPlaceholder('Имя персонажа…')
  await input.fill(letter)
  const item = page.locator('.suggest-item').nth(n)
  await expect(item).toBeVisible()
  const name = (await item.locator('span').first().innerText()).trim()
  await item.click()
  return name
}

const rows = (page: Page) => page.locator('.board .row:not(.head)')

/**
 * Попытка в свободной игре, которая не должна закончить партию. Ответ там
 * случайный, и первая же попытка изредка угадывает — тогда поле ввода
 * пропадает и сценарий про «ещё одну попытку» проверять не на чем. Угадали —
 * берём другого персонажа и пробуем снова.
 */
async function guessKeepPlaying(page: Page): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const name = await guessNth(page, 0)
    await expect(rows(page)).toHaveCount(1)
    if (await page.getByPlaceholder('Имя персонажа…').isVisible()) return name
    await page.getByRole('button', { name: 'Ещё раз' }).click()
    await expect(rows(page)).toHaveCount(0)
  }
  throw new Error('Пять раз подряд угадали с первой попытки — так не бывает')
}

test.describe('Игра «Кто из таверны?»', () => {
  test('партия дня начинается, подсказки работают, попытка ложится в таблицу', async ({ page }) => {
    await open(page, '/game')
    await expect(page.getByRole('heading', { name: 'Кто из таверны?' })).toBeVisible()
    await expect(page.locator('.chip', { hasText: 'Попыток: 0' })).toBeVisible()

    const name = await guessNth(page, 0)
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first().locator('.cell.name')).toContainText(name)
    await expect(page.locator('.chip', { hasText: 'Попыток: 1' })).toBeVisible()
  })

  test('партия дня переживает перезагрузку', async ({ page }) => {
    await open(page, '/game')
    await guessNth(page, 0)
    await expect(rows(page)).toHaveCount(1)

    await open(page, '/game')
    await expect(rows(page)).toHaveCount(1)
  })

  test('свободная игра: другой персонаж сбрасывает таблицу', async ({ page }) => {
    await open(page, '/game')
    await page.getByRole('button', { name: 'Свободная игра' }).click()
    await expect(page.getByRole('button', { name: 'Другой персонаж' })).toBeVisible()

    await guessNth(page, 0)
    await expect(rows(page)).toHaveCount(1)

    await page.getByRole('button', { name: 'Другой персонаж' }).click()
    await expect(rows(page)).toHaveCount(0)
    await expect(page.locator('.chip', { hasText: 'Попыток: 0' })).toBeVisible()
  })

  test('названного персонажа не предлагают снова, а сервер отвергает повтор', async ({ page }) => {
    await login(page, READER)
    await open(page, '/game')
    await page.getByRole('button', { name: 'Свободная игра' }).click()
    await page.getByRole('button', { name: 'Другой персонаж' }).click()

    const name = await guessKeepPlaying(page)

    // В подсказках его больше нет...
    await page.getByPlaceholder('Имя персонажа…').fill(name)
    await expect(page.locator('.suggest-item', { hasText: name })).toHaveCount(0)

    // ...а прямой запрос к API получает отказ.
    const state = await (await page.request.get('/api/game/state?mode=endless')).json()
    const again = await page.request.post('/api/game/guess', { data: { mode: 'endless', id: state.guesses[0].id } })
    expect(again.status()).toBe(409)
    await expect(rows(page)).toHaveCount(1)
  })

  test('рейтинг открывается и закрывается', async ({ page }) => {
    await open(page, '/game')
    await page.getByRole('button', { name: 'Рейтинг' }).click()
    const dialog = page.getByRole('dialog', { name: 'Рейтинг игроков' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Закрыть' }).click()
    await expect(dialog).toHaveCount(0)
  })
})
