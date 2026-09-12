import { test, expect, open, login } from './helpers'
import { ADMIN, READER } from './fixtures'

test.describe('Вход и выход', () => {
  test('форма пароля спрятана и появляется по ?pw=1', async ({ page }) => {
    await open(page, '/login')
    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible()
    await expect(page.getByPlaceholder('Email')).toHaveCount(0)

    await open(page, '/login?pw=1')
    await expect(page.getByPlaceholder('Email')).toBeVisible()
    await expect(page.getByPlaceholder('Пароль')).toBeVisible()
  })

  test('неверный пароль показывает ошибку, не пуская внутрь', async ({ page }) => {
    await open(page, '/login?pw=1')
    await page.getByPlaceholder('Email').fill(READER.email)
    await page.getByPlaceholder('Пароль').fill('wrong-password')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.locator('.err')).toContainText('Неверный email или пароль')
    await expect(page).toHaveURL(/\/login/)
  })

  test('читатель входит и видит себя в шапке', async ({ page }) => {
    await open(page, '/login?pw=1&next=/game')
    await page.getByPlaceholder('Email').fill(READER.email)
    await page.getByPlaceholder('Пароль').fill(READER.password)
    await page.getByRole('button', { name: 'Войти' }).click()

    // next= уважается, а в шапке вместо «Войти» стоит аватарка профиля.
    await expect(page).toHaveURL(/\/game$/)
    await expect(page.locator('header a[href="/profile"]').first()).toBeVisible()
    await expect(page.locator('header').getByRole('link', { name: 'Войти' })).toHaveCount(0)
  })

  test('next= не превращает вход в открытый редирект', async ({ page }) => {
    await open(page, '/login?pw=1&next=https://evil.example')
    await page.getByPlaceholder('Email').fill(READER.email)
    await page.getByPlaceholder('Пароль').fill(READER.password)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page).toHaveURL(/localhost:\d+\/$/)
  })

  test('администратор после входа попадает в панель', async ({ page }) => {
    await open(page, '/login?pw=1')
    await page.getByPlaceholder('Email').fill(ADMIN.email)
    await page.getByPlaceholder('Пароль').fill(ADMIN.password)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page).toHaveURL(/\/admin$/)
  })

  test('выход из профиля возвращает гостя', async ({ page }) => {
    await login(page, READER)
    await open(page, '/profile')
    await page.getByRole('button', { name: 'Выйти' }).click()
    await expect(page.locator('header').getByRole('link', { name: 'Войти' }).first()).toBeVisible()
    // Сессии нет: /api/auth/me отдаёт null (h3 шлёт его пустым телом).
    const me = await (await page.request.get('/api/auth/me')).text()
    expect(['', 'null']).toContain(me)
  })
})
