import { test, expect, open, login } from './helpers'
import { READER, SECOND } from './fixtures'

test.describe('Профиль', () => {
  test('гостя отправляют на вход', async ({ page }) => {
    await open(page, '/profile')
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile|\/login\?next=\/profile/)
  })

  test('имя меняется и сразу видно в шапке', async ({ page }) => {
    await login(page, READER)
    await open(page, '/profile')

    const name = page.getByLabel('Имя под комментариями')
    await expect(name).toHaveValue(READER.name)

    const nick = `Читающий ${Math.random().toString(36).slice(2, 6)}`
    await name.fill(nick)
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.locator('.ok-msg')).toHaveText('Сохранено')
    await expect(page.locator('header a[href="/profile"]').first()).toHaveAttribute('title', nick)

    // Возвращаем как было, чтобы соседние тесты узнали читателя по имени.
    await name.fill(READER.name)
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.locator('.ok-msg')).toHaveText('Сохранено')
  })

  test('чужое имя взять нельзя', async ({ page }) => {
    await login(page, READER)
    await open(page, '/profile')
    await page.getByLabel('Имя под комментариями').fill(SECOND.name.toUpperCase())
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.locator('.err-msg')).toContainText('Имя занято')

    const me = await (await page.request.get('/api/profile')).json()
    expect(me.displayName).toBe(READER.name)
  })

  test('аватарка загружается и подхватывается', async ({ page }) => {
    await login(page, READER)
    // Картинку шлём прямо в API: страница перед отправкой ужимает файл через
    // canvas, а проверить нужно приём и раздачу.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFklEQVQImWP8z8DwHwMDAwMTAwMDAwAlBQMBc9QG0QAAAABJRU5ErkJggg==',
      'base64',
    )
    const res = await page.request.put('/api/profile', {
      multipart: {
        displayName: READER.name,
        avatarFrameId: '',
        avatar: { name: 'avatar.png', mimeType: 'image/png', buffer: png },
      },
    })
    expect(res.ok(), await res.text()).toBeTruthy()

    const me = await (await page.request.get('/api/profile')).json()
    expect(me.avatarUrl).toMatch(/^\/api\/avatars\//)
    const img = await page.request.get(me.avatarUrl)
    expect(img.ok()).toBeTruthy()
    expect(img.headers()['content-type']).toMatch(/^image\//)

    await open(page, '/profile')
    await expect(page.locator('.avatar-face .ua-pic')).toHaveAttribute('src', /avatars/)
  })
})
