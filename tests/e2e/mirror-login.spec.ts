import { test, expect } from './helpers'
import { issueTicket, takeTicket, mirrorFromState } from '../../server/utils/handoff'

/*
  Вход через Google с зеркала. CDN перед inn.taverna-book.ru отдаёт 403 на
  длинные значения в query — код Google туда не доедет. Поэтому с зеркала
  Google возвращает на основной домен, а тот передаёт вход на зеркало коротким
  билетом. Основной домен при этом работает ровно как раньше — это здесь
  проверяется первым.
*/
const google = (url: string) => new URL(url)

test.describe('Вход через Google с зеркала', () => {
  test('на основном домене всё как было: 302 к Google, возврат сюда же, без state', async ({ page }) => {
    const res = await page.request.get('/auth/google?next=/game', { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    const to = google(res.headers()['location']!)
    expect(to.origin).toBe('https://accounts.google.com')
    expect(to.searchParams.get('redirect_uri')).toBe('http://localhost:3100/auth/google')
    expect(to.searchParams.get('client_id')).toBe('e2e-google-client')
    expect(to.searchParams.get('state')).toBe('')
    expect(to.searchParams.get('scope')).toBe('openid email profile')
  })

  test('с зеркала Google отправляют на основной домен и помечают зеркало в state', async ({ page }) => {
    const res = await page.request.get('/auth/google?next=/game', {
      maxRedirects: 0,
      headers: { host: 'inn-production.up.railway.app' },
    })
    expect(res.status()).toBe(200)
    const html = await res.text()
    const target = /location\.replace\("([^"]+)"\)/.exec(html)?.[1]
    expect(target).toBeTruthy()
    const to = google(target!)
    expect(to.origin).toBe('https://accounts.google.com')
    // Возврат — на основной домен (siteUrl стенда), не на зеркало за CDN.
    expect(to.searchParams.get('redirect_uri')).toBe('http://localhost:3100/auth/google')
    expect(to.searchParams.get('state')).toBe('mirror=inn.taverna-book.ru')
  })

  test('билет одноразовый, короткий и живёт минуту', () => {
    const ticket = issueTicket({ userId: 7, created: true })
    expect(ticket).toMatch(/^[A-Za-z0-9]{12}$/)
    expect(takeTicket(ticket)).toEqual({ userId: 7, created: true })
    expect(takeTicket(ticket)).toBeNull()

    const stale = issueTicket({ userId: 8, created: false }, Date.now() - 61_000)
    expect(takeTicket(stale)).toBeNull()
    expect(takeTicket('nonsense')).toBeNull()
    expect(takeTicket(undefined)).toBeNull()
  })

  test('зеркало из state принимается только из белого списка', () => {
    const allowed = ['inn.taverna-book.ru']
    expect(mirrorFromState('mirror=inn.taverna-book.ru', allowed)).toBe('inn.taverna-book.ru')
    expect(mirrorFromState('mirror=INN.taverna-book.ru', allowed)).toBe('inn.taverna-book.ru')
    expect(mirrorFromState('mirror=evil.example', allowed)).toBeNull()
    expect(mirrorFromState('', allowed)).toBeNull()
    expect(mirrorFromState(undefined, allowed)).toBeNull()
  })

  test('выдуманный билет не даёт сессии и возвращает на вход', async ({ page }) => {
    const res = await page.request.get('/auth/handoff?t=abcdefghijkl', { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(res.headers()['location']).toBe('/login?error=google&reason=handoff')
    const me = await (await page.request.get('/api/auth/me')).text()
    expect(['', 'null']).toContain(me)
  })
})
