import { test, expect, login } from './helpers'
import { ADMIN } from './fixtures'
import { blockExternalFetch } from '../../server/utils/offline-guard'

/*
  Изоляция от внешнего мира. Самое страшное, что может сделать тестовый прогон —
  написать живым читателям в телеграм-канал «вышла новая глава». Здесь
  проверяются обе линии защиты: у сервера нет ключей телеграма, и даже ручки,
  которые в бою шлют сообщения, в тесте отвечают «не настроено».
*/
test.describe('Изоляция от телеграма и внешних сервисов', () => {
  test('вход через телеграм и Google недоступен', async ({ page }) => {
    const providers = await (await page.request.get('/api/auth/providers')).json()
    expect(providers.telegram).toBeFalsy()
    expect(providers.google).toBeFalsy()
  })

  test('крон рассылки ничего не отправляет', async ({ page }) => {
    // Секрет в тестовом окружении — 'e2e' (tests/e2e/serve.mjs). В базе есть
    // свежие главы без отметки об отправке — в бою это и есть повод написать.
    const res = await (await page.request.get('/api/cron/notify-new-chapters?secret=e2e')).json()
    expect(res.notified).toBe(false)
    expect(['telegram-not-configured', 'outside-window', 'just-sent']).toContain(res.reason)
  })

  test('ручная рассылка из панели упирается в отсутствие бота', async ({ page }) => {
    await login(page, ADMIN)
    const res = await page.request.post('/api/admin/notify', { data: {} })
    expect(res.status()).toBe(503)
    expect(await res.text()).toContain('не настроен')

    // Главы остались «не разосланными»: отметки об отправке никто не поставил.
    const pending = await (await page.request.get('/api/admin/notify')).json()
    expect(pending.configured).toBe(false)
    expect(pending.chapters.length).toBeGreaterThan(0)
  })

  test('заслон рубит запросы наружу и пропускает localhost', async () => {
    // Сам заслон — та функция, что стоит в сервере под E2E_OFFLINE. Настоящий
    // fetch подменён заглушкой: до него должны доходить только локальные адреса.
    const reached: string[] = []
    const guarded = blockExternalFetch((async (input: RequestInfo | URL) => {
      reached.push(String(input))
      return new Response('ok')
    }) as typeof fetch)

    for (const url of [
      'https://api.telegram.org/bot123:abc/sendMessage',
      'https://oauth.telegram.org/auth',
      'https://oauth2.googleapis.com/token',
      new URL('https://example.com/'),
      new Request('https://api.telegram.org/x'),
    ]) {
      await expect(guarded(url)).rejects.toThrow(/E2E_OFFLINE/)
    }
    expect(reached).toHaveLength(0)

    await expect(guarded('http://localhost:3100/api/settings')).resolves.toBeInstanceOf(Response)
    await expect(guarded('http://127.0.0.1:3100/api/settings')).resolves.toBeInstanceOf(Response)
    expect(reached).toHaveLength(2)
  })

})
