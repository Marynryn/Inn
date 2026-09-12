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

/*
  Телеграм с зеркала — та же передача билетом. Возврат от телеграма собираем
  сами: подпись считается по токену бота, который в стенде выдуманный.
*/
import { createHash, createHmac } from 'node:crypto'

const TOKEN = '123456:e2e-telegram-token'

/** Подпись по правилам телеграма — считаем сами, независимо от сервера. */
function telegramSignature(token: string, fields: Record<string, string>) {
  const check = Object.keys(fields).sort().map(k => `${k}=${fields[k]}`).join('\n')
  const secret = createHash('sha256').update(token).digest()
  return createHmac('sha256', secret).update(check).digest('hex')
}

function telegramReturn(id: string, name: string) {
  const fields: Record<string, string> = {
    id, first_name: name, auth_date: String(Math.floor(Date.now() / 1000)),
  }
  const hash = telegramSignature(TOKEN, fields)
  return new URLSearchParams({ ...fields, hash }).toString()
}

test.describe('Вход через Telegram с зеркала', () => {
  test('на основном домене всё как было: возврат на свой /auth/telegram/done', async ({ page }) => {
    const res = await page.request.get('/auth/telegram?next=/game', { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    const to = new URL(res.headers()['location']!)
    expect(to.origin).toBe('https://oauth.telegram.org')
    expect(to.searchParams.get('bot_id')).toBe('123456')
    expect(to.searchParams.get('origin')).toBe('http://localhost:3100')
    expect(to.searchParams.get('return_to')).toBe('http://localhost:3100/auth/telegram/done')
  })

  test('с зеркала телеграм возвращает на основной домен, с зеркалом в пути', async ({ page }) => {
    const res = await page.request.get('/auth/telegram?next=/game', {
      maxRedirects: 0,
      headers: { host: 'inn-production.up.railway.app' },
    })
    expect(res.status()).toBe(200)
    const target = /location\.replace\("([^"]+)"\)/.exec(await res.text())?.[1]
    const to = new URL(target!)
    expect(to.origin).toBe('https://oauth.telegram.org')
    expect(to.searchParams.get('origin')).toBe('http://localhost:3100')
    expect(to.searchParams.get('return_to')).toBe('http://localhost:3100/auth/telegram/done/inn.taverna-book.ru')
  })

  test('возврат на основной домен с подписью телеграма ставит сессию', async ({ page }) => {
    const res = await page.request.get(`/auth/telegram/done?${telegramReturn('900001', 'Прямой')}`, { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    // Новичок — на профиль.
    expect(res.headers()['location']).toBe('/profile')
    const me = await (await page.request.get('/api/auth/me')).json()
    expect(me.displayName).toBe('Прямой')
  })

  test('возврат для зеркала не ставит сессию здесь, а выдаёт билет, по которому зеркало впускает', async ({ page }) => {
    const res = await page.request.get(
      `/auth/telegram/done/inn.taverna-book.ru?${telegramReturn('900002', 'Зеркальный')}`,
      { maxRedirects: 0 },
    )
    expect(res.status()).toBe(302)
    const location = res.headers()['location']!
    expect(location).toMatch(/^https:\/\/inn\.taverna-book\.ru\/auth\/handoff\?t=[A-Za-z0-9]{12}$/)

    // Зеркало (тот же сервер, за CDN) забирает билет и впускает.
    const ticket = new URL(location).searchParams.get('t')!
    const handoff = await page.request.get(`/auth/handoff?t=${ticket}`, {
      maxRedirects: 0,
      headers: { host: 'inn-production.up.railway.app' },
    })
    expect(handoff.status()).toBe(200)
    expect(await handoff.text()).toContain('location.replace("/profile")')
    const me = await (await page.request.get('/api/auth/me')).json()
    expect(me.displayName).toBe('Зеркальный')

    // Билет одноразовый.
    const again = await page.request.get(`/auth/handoff?t=${ticket}`, { maxRedirects: 0 })
    expect(again.headers()['location']).toBe('/login?error=google&reason=handoff')
  })

  test('чужое зеркало в пути — 404, подделанная подпись — на вход с причиной', async ({ page }) => {
    const bad = await page.request.get(`/auth/telegram/done/evil.example?${telegramReturn('900003', 'Чужой')}`, { maxRedirects: 0 })
    expect(bad.status()).toBe(404)

    const forged = await page.request.get('/auth/telegram/done?id=900004&first_name=X&auth_date=1&hash=' + 'ab'.repeat(32), { maxRedirects: 0 })
    expect(forged.status()).toBe(302)
    expect(forged.headers()['location']).toBe('/login?error=telegram&reason=signature')
    await page.goto(forged.headers()['location']!)
    await expect(page.locator('.err')).toContainText('Telegram не завершил вход')
  })
})
