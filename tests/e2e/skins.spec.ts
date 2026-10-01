import type { Page } from '@playwright/test'
import { test, expect, open, login, apiLogin } from './helpers'
import { ADMIN, READER, SECOND } from './fixtures'

/**
 * Скины страницы читателя. Один скин на весь файл, по шагам: завели, выдали,
 * надели, посмотрели, убрали.
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFklEQVQImWP8z8DwHwMDAwMTAwMDAwAlBQMBc9QG0QAAAABJRU5ErkJggg==',
  'base64',
)

test.describe.configure({ mode: 'serial' })

let skinId = 0

/** Коробка элемента или null, если его нет. */
const box = async (page: Page, selector: string) => page.locator(selector).first().boundingBox()

const overlaps = (a: { x: number, y: number, width: number, height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test.describe('Скины страницы', () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL })
    await apiLogin(request, ADMIN)
    const res = await request.post('/api/admin/skins', {
      multipart: {
        name: 'Паутина',
        accent: '#c9b8e6',
        tint: '#24212a',
        effects: 'spider,dust',
        image: { name: 'web.png', mimeType: 'image/png', buffer: PNG },
      },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    skinId = (await res.json()).skin.id
    await request.dispose()
  })

  test.afterAll(async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL })
    await apiLogin(request, ADMIN)
    await request.delete(`/api/admin/skins/${skinId}`)
    await request.dispose()
  })

  test('без выданного скина читатель его не видит и не может надеть', async ({ page }) => {
    await login(page, SECOND)
    const me = await (await page.request.get('/api/profile')).json()
    expect(me.skins).toEqual([])

    const res = await page.request.put('/api/profile', { multipart: { skinId: String(skinId) } })
    expect(res.status()).toBe(403)
  })

  test('выданный скин надевается и виден на странице, паучок не закрывает текст', async ({ page, browser }) => {
    await login(page, ADMIN)
    // Номер читателя знает только панель: ищем его там по имени.
    const [reader] = await (await page.request.get('/api/admin/users', { params: { q: READER.name } })).json()
    const granted = await page.request.post('/api/admin/skins/grant', { data: { userId: reader.id, skinId } })
    expect(granted.ok()).toBeTruthy()

    await login(page, READER)
    // «О себе» подлиннее: паучок не должен закрыть даже длинный текст.
    await page.request.put('/api/profile', {
      multipart: { about: 'Читаю с первой главы и перечитываю тома, когда жду новые. Болею за Мршу и за всех, кто держит таверну на ногах, и за Эрин тоже.' },
    })
    await open(page, '/profile')
    await page.locator('.skin-pick', { hasText: 'Паутина' }).click()
    await expect(page.locator('.skin-pick.active', { hasText: 'Паутина' })).toBeVisible()

    const me = await (await page.request.get('/api/profile')).json()
    expect(me.skin?.id).toBe(skinId)

    // Чужими глазами: гость видит страницу в скине.
    const guest = await browser.newContext()
    const guestPage = await guest.newPage()
    for (const width of [1280, 390]) {
      await guestPage.setViewportSize({ width, height: 900 })
      await guestPage.goto(`/reader/${me.publicId}`)
      await expect(guestPage.locator('.reader-card.skinned')).toBeVisible()
      await expect(guestPage.locator('.skin-spider')).toBeVisible()

      const lane = await box(guestPage, '.skin-spider')
      for (const text of ['.name', '.meta', '.about']) {
        const b = await box(guestPage, text)
        expect(b, `${text} на ширине ${width}`).not.toBeNull()
        expect(overlaps(lane!, b!), `паучок задевает ${text} на ширине ${width}`).toBe(false)
      }
    }
    await guest.close()

    // Снять — и страница снова без скина.
    await page.locator('.skin-pick', { hasText: 'Без скина' }).click()
    await expect(page.locator('.skin-pick.active', { hasText: 'Без скина' })).toBeVisible()
    const after = await (await page.request.get(`/api/readers/${me.publicId}`)).json()
    expect(after.skin).toBeNull()
  })

  test('примерка: хозяйка сайта видит скин на своей странице, остальные — нет', async ({ page, browser }) => {
    await login(page, ADMIN)
    const me = await (await page.request.get('/api/profile')).json()
    expect(me.skins.find((s: any) => s.id === skinId)?.owned).toBe(false)

    await open(page, `/reader/${me.publicId}?skin=${skinId}`)
    await expect(page.locator('.try-banner')).toContainText('Примерка скина «Паутина»')
    await expect(page.locator('.reader-card.skinned')).toBeVisible()

    // Надеть невыданное нельзя и ей.
    const wear = await page.request.put('/api/profile', { multipart: { skinId: String(skinId) } })
    expect(wear.status()).toBe(403)

    // Чужой ?skin= ничего не меняет.
    const guest = await browser.newContext()
    const pub = await (await guest.request.get(`/api/readers/${me.publicId}?skin=${skinId}`)).json()
    expect(pub.skin).toBeNull()
    await guest.close()
  })

  test('скин — приз барабана: выпадает, выдаётся, и пока барабан идёт, его не удалить', async ({ page }) => {
    await login(page, ADMIN)
    const pic = await (await page.request.post('/api/admin/reel-images', {
      multipart: { image: { name: 's.png', mimeType: 'image/png', buffer: PNG } },
    })).json()
    const id = (await (await page.request.post('/api/admin/reels', { data: { title: 'Скин на барабане' } })).json()).id
    const url = `/api/admin/reels/${id}`
    const saved = await page.request.put(url, {
      data: { segments: [
        { label: 'Паутина', frameId: null, figure: null, skinId, image: null, text: null, weight: 1000, stock: null },
        { label: 'Пусто', frameId: null, figure: null, skinId: null, image: pic.file, text: 'Ничего', weight: 0, stock: null },
      ] },
    })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const started = await page.request.post(`${url}/start`)
    expect(started.ok(), await started.text()).toBeTruthy()

    const spin = await (await page.request.post('/api/reel/spin')).json()
    expect(['won', 'duplicate']).toContain(spin.outcome)
    expect(spin.skin?.id).toBe(skinId)

    const me = await (await page.request.get('/api/profile')).json()
    expect(me.skins.find((s: any) => s.id === skinId)?.owned).toBe(true)

    expect((await page.request.delete(`/api/admin/skins/${skinId}`)).status()).toBe(409)
    await page.request.post(`${url}/finish`)
  })
})
