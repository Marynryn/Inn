import { test, expect, open, login, logout } from './helpers'
import type { Locator, Page } from '@playwright/test'
import { ADMIN, CHAPTERS, READER, chapterUrl } from './fixtures'

/*
  Настройки вида главы: книга в углу открывает окно, всё применяется на ходу,
  гостю запоминается в браузере, читателю — на сервере.
*/

const CHAPTER = chapterUrl(CHAPTERS[2]!.id)

const openSettings = async (page: Page) => {
  await page.getByRole('button', { name: 'Настройки вида' }).click()
  const dialog = page.getByRole('dialog', { name: 'Настройки' })
  await expect(dialog).toBeVisible()
  return dialog
}

/**
 * Выбор в списке окна настроек. Список свой, не системный: сначала
 * раскрываем поле по его подписи, потом жмём строку по её тексту.
 */
const choose = async (dialog: Locator, field: string, option: string) => {
  await dialog.getByRole('button', { name: field, exact: true }).click()
  await dialog.getByRole('option', { name: option, exact: true }).click()
}

const readerFont = (page: Page) =>
  page.locator('.reader-content p').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))

const pageBg = (page: Page) =>
  page.locator('.page-wrap').evaluate(el => getComputedStyle(el).backgroundColor)

test.describe('Настройки вида главы', () => {
  test('окно меняет тему, кегль и высоту строки на ходу и сбрасывает всё по кнопке', async ({ page }) => {
    await open(page, CHAPTER)
    const before = await pageBg(page)
    expect(await readerFont(page)).toBe(16)

    const dialog = await openSettings(page)
    await choose(dialog, 'Тема', 'Белая')
    await expect.poll(() => pageBg(page)).toBe('rgb(255, 255, 255)')

    await choose(dialog, 'Текст', '18 pt')
    await expect.poll(() => readerFont(page)).toBe(24)

    const lineHeight = dialog.getByLabel(/Высота строки/)
    await lineHeight.fill('1.5')
    await expect.poll(() => page.locator('.reader-content').evaluate(el => getComputedStyle(el).lineHeight)).toBe('36px')

    // Ширина: колонка — доля окна (окно тестов шире 1280).
    await dialog.getByLabel(/Ширина/).fill('80')
    const viewport = page.viewportSize()!.width
    await expect.poll(() => page.locator('.reader').evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo(viewport * 0.8, 0)

    await dialog.getByRole('button', { name: 'По умолчанию' }).click()
    await expect.poll(() => pageBg(page)).toBe(before)
    expect(await readerFont(page)).toBe(16)
    await expect(dialog.getByRole('button', { name: 'По умолчанию' })).toBeDisabled()

    await dialog.getByRole('button', { name: 'Закрыть' }).click()
    await expect(dialog).toBeHidden()
  })

  test('гостю настройки запоминаются в браузере и применяются до отрисовки', async ({ page }) => {
    await open(page, CHAPTER)
    const dialog = await openSettings(page)
    await choose(dialog, 'Тема', 'Сепия')
    await choose(dialog, 'Текст', '14 pt')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tavern:reader') ?? 'null')))
      .toMatchObject({ theme: 'sepia', fontSize: 14 })

    // Вторая глава открыта заново: атрибут стоит уже в исходной разметке, без
    // ожидания клиента, — это и есть «без вспышки».
    await page.goto(chapterUrl(CHAPTERS[0]!.id), { waitUntil: 'commit' })
    await expect(page.locator('html')).toHaveAttribute('data-reader-theme', 'sepia')
    await expect.poll(() => readerFont(page)).toBeCloseTo(18.67, 1)
  })

  test('читателю настройки ложатся на сервер и приходят на другом устройстве', async ({ page, browser }) => {
    await login(page, READER)
    await open(page, CHAPTER)
    const dialog = await openSettings(page)
    await choose(dialog, 'Тема', 'Тёмная')
    await dialog.getByLabel(/Ширина/).fill('70')

    // Сохранение с задержкой — ждём, пока сервер узнает.
    await expect.poll(async () => (await (await page.request.get('/api/profile/reader')).json()).settings)
      .toMatchObject({ theme: 'dark', width: 70 })

    // Другой браузер без localStorage: настройки приходят с сервера.
    const other = await browser.newContext()
    const page2 = await other.newPage()
    await login(page2, READER)
    await open(page2, CHAPTER)
    await expect(page2.locator('html')).toHaveAttribute('data-reader-theme', 'dark')
    await expect.poll(() => pageBg(page2)).toBe('rgb(0, 0, 0)')
    await other.close()

    // Прибираемся: другие сценарии читателя ждут стандартный вид.
    await page.request.put('/api/profile/reader', { data: { theme: 'default', fontSize: 12, lineHeight: 1.85, width: 50 } })
    await logout(page)
  })

  test('сервер приводит присланное к допустимым рамкам, гостю не отвечает', async ({ page }) => {
    expect((await page.request.put('/api/profile/reader', { data: { theme: 'dark' } })).status()).toBe(401)

    await login(page, READER)
    const res = await page.request.put('/api/profile/reader', {
      data: { theme: 'neon', fontSize: 13, lineHeight: 9, width: 10 },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).settings).toEqual({ theme: 'default', fontSize: 12, lineHeight: 2, width: 50 })

    await page.request.put('/api/profile/reader', { data: { theme: 'default', fontSize: 12, lineHeight: 1.85, width: 50 } })
    await logout(page)
  })

  test('цвет и кегль, заданные в самой главе, сильнее темы', async ({ page }) => {
    // Правим главу как админ: фразу с цветом и абзац с кеглем в процентах.
    await login(page, ADMIN)
    const id = CHAPTERS[2]!.id
    const current = await (await page.request.get(`/api/chapters/${encodeURIComponent(id)}`)).json()
    const styled = '<p class="e2e-fairy">Речь <span style="color: rgb(120, 200, 255)">фей</span> голубая.</p>'
      + '<p class="e2e-big" style="font-size: 200%">Крупно.</p>'
    const put = await page.request.put(`/api/admin/chapters/${encodeURIComponent(id)}`, {
      data: { contentHtml: current.contentHtml + styled },
    })
    expect(put.ok()).toBeTruthy()
    await logout(page)

    await open(page, CHAPTER)
    const dialog = await openSettings(page)
    await choose(dialog, 'Тема', 'Белая')
    await choose(dialog, 'Текст', '12 pt')
    await page.keyboard.press('Escape')

    await expect.poll(() => pageBg(page)).toBe('rgb(255, 255, 255)')
    const fairy = page.locator('.e2e-fairy span')
    await expect(fairy).toHaveCSS('color', 'rgb(120, 200, 255)')
    // Обычный текст рядом — цветом темы, а не голубым.
    await expect(page.locator('.e2e-fairy')).toHaveCSS('color', 'rgb(17, 17, 17)')
    // 200 % от 12pt (16px) — 32px, и строка выросла вместе с кеглем.
    await expect(page.locator('.e2e-big')).toHaveCSS('font-size', '32px')
    const big = await page.locator('.e2e-big').evaluate(el => parseFloat(getComputedStyle(el).lineHeight))
    expect(big).toBeCloseTo(32 * 1.85, 0)

    // Возвращаем главу и вид: соседним сценариям нужен исходный текст.
    await (await openSettings(page)).getByRole('button', { name: 'По умолчанию' }).click()
    await login(page, ADMIN)
    await page.request.put(`/api/admin/chapters/${encodeURIComponent(id)}`, { data: { contentHtml: current.contentHtml } })
    await logout(page)
  })

  test('полный экран: кнопка с подсказкой разворачивает страницу', async ({ page }) => {
    await open(page, CHAPTER)
    const btn = page.getByRole('button', { name: 'Полноэкранный режим' })
    await expect(btn).toHaveAttribute('title', 'Полноэкранный режим')
    await btn.click()
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true)
    // Шапка сайта уходит: полный экран включают ради текста.
    await expect(page.locator('.app-header')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Выйти из полноэкранного режима' })).toBeVisible()
  })

  test('значки прячутся при прокрутке вниз и возвращаются при прокрутке вверх', async ({ page }) => {
    await open(page, CHAPTER)
    const book = page.locator('.reader-settings')
    // Прячется рейка целиком: кнопка полного экрана стоит на ней, выровненная
    // по колонке текста.
    const fs = page.locator('.fs-rail')
    await expect(book).not.toHaveClass(/tucked/)

    await page.mouse.wheel(0, 600)
    await expect(book).toHaveClass(/tucked/)
    await expect(fs).toHaveClass(/tucked/)

    await page.mouse.wheel(0, -200)
    await expect(book).not.toHaveClass(/tucked/)
    await expect(fs).not.toHaveClass(/tucked/)
  })
})
