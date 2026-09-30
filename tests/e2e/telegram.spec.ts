import { test, expect, open, login } from './helpers'
import { ADMIN, READER } from './fixtures'

/**
 * Телеграм из панели: своё сообщение и правка текста оповещения о главах. Бот в
 * стенде «не настроен» (нет chat id), а сверх того сервер не выпускает наружу
 * ни одного запроса — отправка здесь всегда упирается в 503, и это проверяется.
 */
test.describe('Телеграм из панели', () => {
  test('своё сообщение: пустое не уходит, без бота — понятный отказ', async ({ page }) => {
    await login(page, ADMIN)

    const empty = await page.request.post('/api/admin/notify/custom', { data: { text: '   ' } })
    expect(empty.status()).toBe(400)

    const long = await page.request.post('/api/admin/notify/custom', { data: { text: 'а'.repeat(4097) } })
    expect(long.status()).toBe(400)

    const res = await page.request.post('/api/admin/notify/custom', { data: { text: 'В таверне заработал барабан!' } })
    expect(res.status()).toBe(503)
    expect(await res.text()).toContain('не настроен')
  })

  test('читатель своё сообщение отправить не может', async ({ page }) => {
    await login(page, READER)
    const res = await page.request.post('/api/admin/notify/custom', { data: { text: 'привет' } })
    expect(res.status()).toBe(403)
  })

  test('текст оповещения о главах правится прямо в окошке', async ({ page }) => {
    await login(page, ADMIN)
    await open(page, '/admin')
    await page.locator('.sb-tab', { hasText: 'Уведомления' }).click()

    const box = page.getByLabel('Текст сообщения — можно править')
    await expect(box).toHaveValue(/Добавлен/)
    const built = await box.inputValue()

    // Поправила — появляется «Собрать заново», и оно возвращает собранный текст.
    await box.fill('Розыгрыш в таверне! ' + built)
    await expect(page.getByRole('button', { name: 'Собрать заново' })).toBeVisible()
    await page.getByRole('button', { name: 'Собрать заново' }).click()
    await expect(box).toHaveValue(built)

    // Длину своего текста сервер проверяет сам: телеграм длиннее 4096 знаков не примет.
    const long = await page.request.post('/api/admin/notify', { data: { text: 'а'.repeat(4097) } })
    expect(long.status()).toBe(400)
  })
})
