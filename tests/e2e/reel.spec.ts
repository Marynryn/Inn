import type { APIRequestContext } from '@playwright/test'
import { test, expect, open, login, apiLogin } from './helpers'
import { ADMIN, READER, SECOND } from './fixtures'

/**
 * Барабан. Один барабан на весь файл, по шагам: раз в день на человека — значит,
 * каждый читатель крутит здесь ровно один раз, и порядок шагов важен.
 *
 * Шансы выставлены так, чтобы исход был известен заранее: рамка — 100%, тираж —
 * одна штука. Первый не владеющий ею её выигрывает, дальше она кончается, и
 * остаётся только сценка.
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFklEQVQImWP8z8DwHwMDAwMTAwMDAwAlBQMBc9QG0QAAAABJRU5ErkJggg==',
  'base64',
)

test.describe.configure({ mode: 'serial' })

let reelId = 0
let frameId = 0

const asAdmin = async (request: APIRequestContext) => apiLogin(request, ADMIN)

test.describe('Барабан', () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL })
    await asAdmin(request)

    const made = await request.post('/api/admin/frames', {
      multipart: { name: 'Рамка барабана', inPool: '1', image: { name: 'f.png', mimeType: 'image/png', buffer: PNG } },
    })
    expect(made.ok(), await made.text()).toBeTruthy()
    frameId = (await made.json()).frame.id

    const pic = await request.post('/api/admin/reel-images', {
      multipart: { image: { name: 's.png', mimeType: 'image/png', buffer: PNG } },
    })
    expect(pic.ok(), await pic.text()).toBeTruthy()
    const scene = await pic.json()

    const created = await request.post('/api/admin/reels', { data: { title: 'Тестовый ивент' } })
    reelId = (await created.json()).id

    // Сначала шансы не сходятся в сто — запуск должен отказать.
    const segments = (frameWeight: number) => [
      { label: 'Рамка барабана', frameId, image: null, text: null, weight: frameWeight, stock: 1 },
      { label: 'Суп от Эрин', frameId: null, image: scene.file, text: 'Рамки нет, но суп хороший.', weight: 0, stock: null },
    ]
    await request.put(`/api/admin/reels/${reelId}`, { data: { title: 'Тестовый ивент', segments: segments(950) } })
    const early = await request.post(`/api/admin/reels/${reelId}/start`)
    expect(early.status()).toBe(400)
    expect((await early.json()).message).toContain('95%')

    const saved = await request.put(`/api/admin/reels/${reelId}`, { data: { title: 'Тестовый ивент', segments: segments(1000) } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const started = await request.post(`/api/admin/reels/${reelId}/start`)
    expect(started.ok(), await started.text()).toBeTruthy()

    // Рамка ивента уходит из общей случайной раздачи.
    const { frames } = await (await request.get('/api/admin/frames')).json()
    expect(frames.find((f: any) => f.id === frameId).inPool).toBe(false)

    await request.dispose()
  })

  test.afterAll(async ({ playwright, baseURL }) => {
    // Идущий барабан добавил бы строку в колокольчик всем остальным тестам.
    const request = await playwright.request.newContext({ baseURL })
    await asAdmin(request)
    await request.post(`/api/admin/reels/${reelId}/finish`)
    await request.delete(`/api/admin/frames/${frameId}`)
    await request.dispose()
  })

  test('новый барабан — только для админов: читателю его нет', async ({ page }) => {
    await login(page, READER)
    const state = await (await page.request.get('/api/reel')).json()
    expect(state.reel).toBeNull()
    const notes = await (await page.request.get('/api/notifications')).json()
    expect(notes.reel).toBeNull()
    const spin = await page.request.post('/api/reel/spin')
    expect(spin.status()).toBe(404)
  })

  test('повторка: рамка уже есть — так и говорим, тираж не тратится', async ({ page }) => {
    await login(page, ADMIN)
    const me = await (await page.request.get('/api/profile')).json()
    await page.request.post('/api/admin/frames/grant', { data: { userId: me.id, frameId } })

    const res = await page.request.post('/api/reel/spin')
    expect(res.ok(), await res.text()).toBeTruthy()
    const spin = await res.json()
    expect(spin.outcome).toBe('duplicate')
    expect(spin.frame.id).toBe(frameId)

    // Админу раз в день не указ: крутит снова, и снова повторка.
    const again = await page.request.post('/api/reel/spin')
    expect(again.ok(), await again.text()).toBeTruthy()

    const [reel] = (await (await page.request.get('/api/admin/reels')).json()).filter((r: any) => r.id === reelId)
    expect(reel.segments[0].won).toBe(0)
    expect(reel.segments[0].duplicates).toBe(2)

    // Тексты окна — свои у барабана; пустые и совпадающие с умолчанием не хранятся.
    const texted = await page.request.put(`/api/admin/reels/${reelId}`, { data: { texts: { spinButton: 'Крутануть', footer: '', lead: 'Одна попытка в день. Что остановится на линии, то и твоё.' } } })
    expect(texted.ok(), await texted.text()).toBeTruthy()
    const [withTexts] = (await (await page.request.get('/api/admin/reels')).json()).filter((r: any) => r.id === reelId)
    expect(withTexts.texts).toEqual({ spinButton: 'Крутануть' })
    const shown = await (await page.request.get('/api/reel')).json()
    expect(shown.reel.texts.spinButton).toBe('Крутануть')
    expect(shown.reel.texts.footer).toBe('Следующая попытка — завтра, пока идёт ивент.')
    await page.request.put(`/api/admin/reels/${reelId}`, { data: { texts: {} } })

    // Опробовали — открываем читателям, не останавливая барабан.
    expect(reel.adminsOnly).toBe(true)
    const opened = await page.request.put(`/api/admin/reels/${reelId}`, { data: { adminsOnly: false } })
    expect(opened.ok(), await opened.text()).toBeTruthy()
  })

  test('читатель видит приглашение, крутит, выигрывает и надевает', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await login(page, READER)
    await open(page, '/')

    const notes = await (await page.request.get('/api/notifications')).json()
    expect(notes.reel?.id).toBe(reelId)

    await page.getByRole('button', { name: /Уведомления/ }).click()
    await page.getByRole('button', { name: /Барабан «Тестовый ивент»/ }).click()
    await page.getByRole('button', { name: 'Крутить' }).click()

    await expect(page.getByText('Тебе досталась рамка')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Надеть' }).click()
    await expect(page.getByText('✓ Надета')).toBeVisible()

    const me = await (await page.request.get('/api/profile')).json()
    expect(me.avatarFrame?.id).toBe(frameId)

    // Вторая попытка за день не проходит, приглашение уходит.
    const again = await page.request.post('/api/reel/spin')
    expect(again.status()).toBe(409)
    const after = await (await page.request.get('/api/notifications')).json()
    expect(after.reel).toBeNull()
  })

  test('тираж кончился — выпадает сценка, даже с нулевым шансом', async ({ page }) => {
    await login(page, SECOND)
    const res = await page.request.post('/api/reel/spin')
    expect(res.ok(), await res.text()).toBeTruthy()
    const spin = await res.json()
    expect(spin.outcome).toBe('scene')
    expect(spin.label).toBe('Суп от Эрин')
    expect(spin.text).toBe('Рамки нет, но суп хороший.')

    const state = await (await page.request.get('/api/reel')).json()
    expect(state.today.outcome).toBe('scene')
    expect(state.canSpin).toBe(false)
    // Шансов и тиража читатель не видит.
    expect(JSON.stringify(state)).not.toContain('weight')
  })

  test('запущенный барабан не правится, рамку из него не удалить', async ({ page }) => {
    await login(page, ADMIN)
    const edit = await page.request.put(`/api/admin/reels/${reelId}`, { data: { segments: [] } })
    expect(edit.status()).toBe(409)
    const del = await page.request.delete(`/api/admin/frames/${frameId}`)
    expect(del.status()).toBe(409)
  })
})
