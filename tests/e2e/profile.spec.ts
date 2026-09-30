import { test, expect, open, login, logout } from './helpers'
import { ADMIN, CHAPTERS, READER, SECOND } from './fixtures'

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

test.describe('Страница читателя', () => {
  test('«О себе» сохраняется и видно всем, почты там нет', async ({ page, browser }) => {
    await login(page, READER)
    await open(page, '/profile')

    const about = `С первой главы.\n\n\n\nБолею за Мршу ${Math.random().toString(36).slice(2, 6)}`
    await page.getByLabel('О себе').fill(about)
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.locator('.ok-msg')).toHaveText('Сохранено')

    const me = await (await page.request.get('/api/profile')).json()
    // Пустые строки подряд схлопываются до одной — растянуть страницу ими нельзя.
    expect(me.about).toBe(about.replace(/\n{3,}/g, '\n\n'))

    await page.getByRole('link', { name: 'Как меня видят другие' }).click()
    await expect(page).toHaveURL(new RegExp(`/reader/${me.publicId}$`))
    await expect(page.locator('h1.name')).toHaveText(READER.name)
    await expect(page.locator('.about')).toContainText('Болею за Мршу')

    // Гость видит ту же страницу, но ни почты, ни способа входа в ответе нет.
    const guest = await browser.newContext()
    const pub = await (await guest.request.get(`/api/readers/${me.publicId}`)).json()
    await guest.close()
    expect(pub.name).toBe(READER.name)
    expect(JSON.stringify(pub)).not.toContain(READER.email)
    expect(pub).not.toHaveProperty('email')
    expect(pub).not.toHaveProperty('providers')
  })

  test('несуществующий читатель — понятная заглушка', async ({ page }) => {
    await open(page, '/reader/000000000000')
    await expect(page.getByRole('heading', { name: 'Такого читателя нет' })).toBeVisible()
  })

  test('хозяйка сайта стирает чужое «О себе», читатель — нет', async ({ page }) => {
    await login(page, SECOND)
    const put = await page.request.put('/api/profile', { multipart: { about: 'Текст, который придётся стереть' } })
    expect(put.ok(), await put.text()).toBeTruthy()
    const { publicId: code } = await (await page.request.get('/api/profile')).json()

    const denied = await page.request.delete(`/api/admin/readers/${code}/about`)
    expect(denied.status()).toBe(403)

    await logout(page)
    await login(page, ADMIN)
    await open(page, `/reader/${code}`)
    await expect(page.locator('.about')).toBeVisible()
    await page.getByRole('button', { name: 'Стереть «О себе»' }).click()
    await expect(page.locator('.about')).toHaveCount(0)

    const pub = await (await page.request.get(`/api/readers/${code}`)).json()
    expect(pub.about).toBeNull()
  })

  test('хозяйка сайта примеряет любую рамку, а носит только выданную', async ({ page }) => {
    await login(page, ADMIN)
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFklEQVQImWP8z8DwHwMDAwMTAwMDAwAlBQMBc9QG0QAAAABJRU5ErkJggg==',
      'base64',
    )
    const made = await page.request.post('/api/admin/frames', {
      multipart: { name: 'Рамка будущего ивента', inPool: '0', image: { name: 'f.png', mimeType: 'image/png', buffer: png } },
    })
    expect(made.ok(), await made.text()).toBeTruthy()
    const { frame } = await made.json()

    try {
      const me = await (await page.request.get('/api/profile')).json()
      // Каталог открыт для примерки…
      expect(me.frames.find((f: any) => f.id === frame.id)?.owned).toBe(false)

      // …но надеть невыданную нельзя: её увидели бы все до розыгрыша.
      const denied = await page.request.put('/api/profile', { multipart: { avatarFrameId: String(frame.id) } })
      expect(denied.status()).toBe(403)

      const granted = await page.request.post('/api/admin/frames/grant', { data: { userId: me.id, frameId: frame.id } })
      expect(granted.ok()).toBeTruthy()
      const worn = await page.request.put('/api/profile', { multipart: { avatarFrameId: String(frame.id) } })
      expect(worn.ok(), await worn.text()).toBeTruthy()

      const pub = await (await page.request.get(`/api/readers/${me.publicId}`)).json()
      expect(pub.avatarFrame?.id).toBe(frame.id)
      expect(pub.frames.map((f: any) => f.id)).toContain(frame.id)
    } finally {
      await page.request.delete(`/api/admin/frames/${frame.id}`)
    }
  })

  test('номер читателя наружу не выходит — только публичный код', async ({ page }) => {
    await login(page, READER)

    const me = await (await page.request.get('/api/auth/me')).json()
    expect(me).not.toHaveProperty('id')
    const profile = await (await page.request.get('/api/profile')).json()
    expect(profile.id).toBeUndefined()
    expect(profile.publicId).toMatch(/^[0-9a-f]{12}$/)

    // Комментарий читателя приходит с кодом автора, без номера.
    const res = await page.request.post('/api/comments', {
      data: { chapterId: CHAPTERS[0]!.id, authorName: READER.name, body: `Проверка кода ${Math.random().toString(36).slice(2, 6)}` },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const posted = await res.json()
    expect(posted).not.toHaveProperty('userId')
    expect(posted.authorCode).toBe(profile.publicId)

    const list = await (await page.request.get(`/api/comments?chapterId=${CHAPTERS[0]!.id}`)).json()
    expect(list.every((c: any) => !('userId' in c))).toBe(true)

    // Аватарка ложится под кодом, а не под номером.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFklEQVQImWP8z8DwHwMDAwMTAwMDAwAlBQMBc9QG0QAAAABJRU5ErkJggg==',
      'base64',
    )
    const put = await page.request.put('/api/profile', {
      multipart: { avatar: { name: 'a.png', mimeType: 'image/png', buffer: png } },
    })
    expect(put.ok(), await put.text()).toBeTruthy()
    const { avatarUrl } = await put.json()
    expect(avatarUrl).toContain(`avatar-${profile.publicId}.`)
  })
})
