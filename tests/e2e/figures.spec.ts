import type { APIRequestContext } from '@playwright/test'
import { test, expect, open, login, apiLogin } from './helpers'
import { ADMIN, CHAPTERS, READER, SECOND, chapterUrl } from './fixtures'

/**
 * Фигурка у имени — приз барабана. Свой барабан на файл: призрак со 100% и
 * тиражом в одну штуку. Первый крутящий его выигрывает, второму остаётся сценка.
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFklEQVQImWP8z8DwHwMDAwMTAwMDAwAlBQMBc9QG0QAAAABJRU5ErkJggg==',
  'base64',
)

test.describe.configure({ mode: 'serial' })

let reelId = 0

const asAdmin = async (request: APIRequestContext) => apiLogin(request, ADMIN)

test.describe('Фигурка у имени', () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL })
    await asAdmin(request)

    const pic = await request.post('/api/admin/reel-images', {
      multipart: { image: { name: 's.png', mimeType: 'image/png', buffer: PNG } },
    })
    const scene = await pic.json()

    reelId = (await (await request.post('/api/admin/reels', { data: { title: 'Хеллоуин' } })).json()).id

    // Незнакомую фигурку сохранить нельзя.
    const bad = await request.put(`/api/admin/reels/${reelId}`, {
      data: { segments: [{ label: 'Дракон', frameId: null, figure: 'dragon', image: null, text: null, weight: 1000, stock: null }] },
    })
    expect(bad.status()).toBe(400)

    const saved = await request.put(`/api/admin/reels/${reelId}`, {
      data: {
        title: 'Хеллоуин',
        adminsOnly: false,
        segments: [
          { label: 'Призрак', frameId: null, figure: 'ghost', image: null, text: null, weight: 1000, stock: 1 },
          { label: 'Тыквенный суп', frameId: null, figure: null, image: scene.file, text: 'Фигурки нет, но суп хороший.', weight: 0, stock: null },
        ],
      },
    })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const started = await request.post(`/api/admin/reels/${reelId}/start`)
    expect(started.ok(), await started.text()).toBeTruthy()
    await request.dispose()
  })

  test.afterAll(async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL })
    await asAdmin(request)
    await request.post(`/api/admin/reels/${reelId}/finish`)
    await request.dispose()
  })

  test('чужую фигурку не надеть', async ({ page }) => {
    await login(page, READER)
    const form = { figure: 'ghost' }
    const res = await page.request.put('/api/profile', { multipart: form })
    expect(res.status()).toBe(403)
  })

  test('выпала фигурка — надел, и она у имени в комментариях и на странице', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await login(page, READER)
    await open(page, '/')

    await page.getByRole('button', { name: /Уведомления/ }).click()
    await page.getByRole('button', { name: /Барабан «Хеллоуин»/ }).click()
    await page.getByRole('button', { name: 'Крутить' }).click()

    await expect(page.getByText('Тебе досталась фигурка')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Надеть' }).click()
    await expect(page.getByText('✓ Надета')).toBeVisible()

    const me = await (await page.request.get('/api/profile')).json()
    expect(me.figure?.id).toBe('ghost')
    expect(me.figures.map((f: any) => f.id)).toEqual(['ghost'])

    const posted = await page.request.post('/api/comments', {
      data: { chapterId: CHAPTERS[0]!.id, body: 'Бу! Я теперь с призраком.' },
    })
    expect(posted.ok(), await posted.text()).toBeTruthy()

    await open(page, `${chapterUrl(CHAPTERS[0]!.id)}/comments`)
    const comment = page.locator('.comments-section .comment-item', { hasText: 'Бу! Я теперь с призраком.' })
    await expect(comment.getByRole('img', { name: 'Призрак' })).toBeVisible()

    await open(page, `/reader/${me.publicId}`)
    await expect(page.getByRole('heading', { level: 1 }).getByRole('img', { name: 'Призрак' })).toBeVisible()
  })

  test('тираж кончился — второму сценка', async ({ page }) => {
    await login(page, SECOND)
    const spin = await (await page.request.post('/api/reel/spin')).json()
    expect(spin.outcome).toBe('scene')
    expect(spin.figure).toBeNull()

    const me = await (await page.request.get('/api/profile')).json()
    expect(me.figures).toEqual([])
  })

  test('несколько попыток в день: считаются, кончаются, приглашение уходит', async ({ page, playwright, baseURL }) => {
    const admin = await playwright.request.newContext({ baseURL })
    await asAdmin(admin)
    await admin.put(`/api/admin/reels/${reelId}`, { data: { spinsPerDay: 3 } })
    await admin.dispose()

    // Одна попытка уже была в прошлом тесте — осталось две.
    await login(page, SECOND)
    const state = await (await page.request.get('/api/reel')).json()
    expect(state.left).toBe(2)
    expect(state.canSpin).toBe(true)

    expect((await (await page.request.post('/api/reel/spin')).json()).left).toBe(1)
    expect((await (await page.request.post('/api/reel/spin')).json()).left).toBe(0)
    expect((await page.request.post('/api/reel/spin')).status()).toBe(409)

    const notes = await (await page.request.get('/api/notifications')).json()
    expect(notes.reel).toBeNull()
  })

  test('хозяйка сайта примеряет любую, носит только выданную себе', async ({ page }) => {
    await login(page, ADMIN)
    const me = await (await page.request.get('/api/profile')).json()
    expect(me.figures.every((f: any) => !f.owned)).toBe(true)
    expect(me.figures).toHaveLength(5)

    const early = await page.request.put('/api/profile', { multipart: { figure: 'bat' } })
    expect(early.status()).toBe(403)

    await open(page, '/profile')
    await page.getByRole('button', { name: /Летучая мышь/ }).click()
    await page.getByRole('button', { name: 'Выдать себе и надеть' }).last().click()
    await expect(page.locator('.skin-pick.active', { hasText: 'Летучая мышь' })).toBeVisible()

    const after = await (await page.request.get('/api/profile')).json()
    expect(after.figure?.id).toBe('bat')
    await page.request.put('/api/profile', { multipart: { figure: '' } })
  })
})
