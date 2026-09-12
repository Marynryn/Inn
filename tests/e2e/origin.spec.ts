import { test, expect, login } from './helpers'
import { ADMIN } from './fixtures'

/*
  Зеркало за CDN: к серверу запрос приходит со служебным Host Railway, а
  настоящий домен — в X-Forwarded-Host. Вход через Google строит redirect_uri
  из этого домена, иначе Google возвращал бы человека не туда (см.
  server/utils/public-origin.ts).
*/
test.describe('Адрес сайта за CDN', () => {
  test('известное зеркало берётся из X-Forwarded-Host, чужой домен — нет', async ({ page }) => {
    await login(page, ADMIN)

    const plain = await (await page.request.get('/api/admin/origin')).json()
    expect(plain.origin).toBe('http://localhost:3100')
    expect(plain.mirrors).toContain('inn.taverna-book.ru')

    const mirror = await (await page.request.get('/api/admin/origin', {
      headers: { 'x-forwarded-host': 'inn.taverna-book.ru', 'x-forwarded-proto': 'https' },
    })).json()
    expect(mirror.origin).toBe('https://inn.taverna-book.ru')

    const evil = await (await page.request.get('/api/admin/origin', {
      headers: { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' },
    })).json()
    // Протоколу за прокси верим и так (Railway его проставляет), а хост — нет.
    expect(new URL(evil.origin).host).toBe('localhost:3100')

    // CDN, который заголовок не шлёт: Host — служебное имя Railway, и при
    // единственном зеркале сервер понимает, что открыт через него.
    const viaCdn = await (await page.request.get('/api/admin/origin', {
      headers: { host: 'inn-production.up.railway.app' },
    })).json()
    expect(viaCdn.host).toBe('inn-production.up.railway.app')
    expect(viaCdn.origin).toBe('https://inn.taverna-book.ru')
  })

  test('без ключей Google вход не падает, а возвращает на страницу входа', async ({ page }) => {
    const res = await page.request.get('/auth/google?next=/game', { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(res.headers()['location']).toMatch(/^\/login\?error=google&reason=/)
  })

  test('негодный код от Google ведёт на страницу входа с причиной, а не на страницу ошибки', async ({ page }) => {
    // Ключей в тесте нет — обработчик спотыкается на первом же шаге. Важно, что
    // не голой страницей ошибки: человек возвращается на вход и видит, что
    // случилось, а код причины можно прислать разработчику.
    const res = await page.request.get('/auth/google?code=stale-code&scope=email', { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(res.headers()['location']).toMatch(/^\/login\?error=google&reason=/)

    await page.goto(res.headers()['location']!)
    await expect(page.locator('.err')).toContainText('Google не завершил вход')
  })

  test('за CDN переадресацию делает браузер, а не прокси', async ({ page }) => {
    // CDN зеркала сам ходит по 302 и приносит чужую страницу под нашим адресом.
    // Поэтому для запросов через него ответ — не редирект, а страница с
    // мгновенным переходом; на своём домене остаётся обычный 302 (тест выше).
    const res = await page.request.get('/auth/google?next=/game', {
      maxRedirects: 0,
      headers: { host: 'inn-production.up.railway.app' },
    })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/html')
    expect(res.headers()['cache-control']).toBe('no-store')
    const html = await res.text()
    expect(html).toMatch(/http-equiv="refresh" content="0;url=\/login\?error=google&reason=/)
    expect(html).toMatch(/location\.replace\("\/login\?error=google&reason=/)
  })
})
