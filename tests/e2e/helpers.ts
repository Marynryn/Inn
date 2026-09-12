import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'

type Account = { email: string; password: string }

/**
 * Каждому тесту — свой «адрес»: лимиты на комментарии и попытки в игре
 * считаются по IP, а из одной машины все тесты выглядели бы одним человеком.
 */
const fakeIp = () => `10.${rnd(255)}.${rnd(255)}.${rnd(254) + 1}`
const rnd = (n: number) => Math.floor(Math.random() * n)

export const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'x-forwarded-for': fakeIp() })
  },
})

export { expect }

/** Вход через API: кука сессии ложится в контекст, дальше страницы открываются уже авторизованными. */
export async function login(page: Page, account: Account) {
  const res = await page.request.post('/api/auth/login', { data: account })
  expect(res.ok(), `login ${account.email}: ${res.status()}`).toBeTruthy()
}

export async function logout(page: Page) {
  await page.request.post('/api/auth/logout')
}

export async function apiLogin(request: APIRequestContext, account: Account) {
  const res = await request.post('/api/auth/login', { data: account })
  expect(res.ok(), `login ${account.email}: ${res.status()}`).toBeTruthy()
}

/**
 * Открыть страницу и дождаться, пока Vue возьмёт её в руки. Признак — запрос
 * /api/auth/me: его шлёт клиентский плагин, значит, приложение уже живое и
 * клики не уйдут в пустоту.
 */
export async function open(page: Page, url: string) {
  const me = page.waitForResponse(r => r.url().includes('/api/auth/me'))
  await page.goto(url)
  await me
}
