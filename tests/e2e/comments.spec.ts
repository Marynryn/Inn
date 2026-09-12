import { test, expect, open, login } from './helpers'
import { ADMIN, CHAPTERS, READER, SECOND, chapterUrl } from './fixtures'

const discussionUrl = `${chapterUrl(CHAPTERS[0]!.id)}/comments`
const stamp = () => Math.random().toString(36).slice(2, 8)

test.describe('Комментарии', () => {
  test('гость пишет под своим именем, и комментарий приходит без перезагрузки', async ({ page }) => {
    await open(page, discussionUrl)
    const section = page.locator('.comments-section')
    const text = `Гостевой отзыв ${stamp()}`

    await section.getByPlaceholder('Твоё имя').fill('Прохожий')
    await section.getByPlaceholder('Что думаешь об этой главе?').fill(text)
    await section.getByRole('button', { name: 'Отправить' }).click()

    // Список обновляется по вебсокету — страницу не перезагружаем.
    const item = section.locator('.comment-item', { hasText: text })
    await expect(item).toBeVisible()
    await expect(item.locator('.comment-name')).toHaveText('Прохожий')
    await expect(section.getByPlaceholder('Что думаешь об этой главе?')).toHaveValue('')
  })

  test('гость не может подписаться именем читателя', async ({ page }) => {
    await open(page, discussionUrl)
    const section = page.locator('.comments-section')
    await section.getByPlaceholder('Твоё имя').fill(READER.name)
    await section.getByPlaceholder('Что думаешь об этой главе?').fill(`Самозванец ${stamp()}`)
    await section.getByRole('button', { name: 'Отправить' }).click()
    await expect(section.locator('.comment-error')).toContainText('Имя занято')
  })

  test('пустой комментарий отправить нельзя', async ({ page }) => {
    await open(page, discussionUrl)
    const section = page.locator('.comments-section')
    await expect(section.getByRole('button', { name: 'Отправить' })).toBeDisabled()
    await section.getByPlaceholder('Что думаешь об этой главе?').fill('   ')
    await expect(section.getByRole('button', { name: 'Отправить' })).toBeDisabled()
  })

  test('читатель подписывается автоматически, спойлер скрыт до клика', async ({ page }) => {
    await login(page, READER)
    await open(page, discussionUrl)
    const section = page.locator('.comments-section')
    const text = `Спойлер про козла ${stamp()}`

    // У вошедшего поля «имя» нет — подпись берётся из профиля.
    await expect(section.getByPlaceholder('Твоё имя')).toHaveCount(0)
    await section.getByPlaceholder('Что думаешь об этой главе?').fill(text)
    await section.getByLabel('Содержит спойлер').check()
    await section.getByRole('button', { name: 'Отправить' }).click()

    const item = section.locator('.comment-item', { hasText: text })
    await expect(item.locator('.comment-name')).toHaveText(READER.name)
    await expect(item.locator('.spoiler-badge')).toBeVisible()
    await expect(item.locator('.comment-body')).toHaveClass(/is-spoiler/)
    await item.locator('.comment-body').click()
    await expect(item.locator('.comment-body')).not.toHaveClass(/is-spoiler/)
  })

  test('ответ приходит автору уведомлением', async ({ browser, page }) => {
    // SECOND пишет комментарий...
    await login(page, SECOND)
    await open(page, discussionUrl)
    const section = page.locator('.comments-section')
    const rootText = `Кто-нибудь понял концовку? ${stamp()}`
    await section.getByPlaceholder('Что думаешь об этой главе?').fill(rootText)
    await section.getByRole('button', { name: 'Отправить' }).click()
    const root = section.locator('.comment-thread', { hasText: rootText })
    await expect(root).toBeVisible()

    // ...READER отвечает из другого браузера...
    const other = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.9.9.9' } })
    const reader = await other.newPage()
    await login(reader, READER)
    await open(reader, discussionUrl)
    const thread = reader.locator('.comment-thread', { hasText: rootText })
    await thread.getByRole('button', { name: 'Ответить' }).first().click()
    const replyText = `Понял, но не скажу ${stamp()}`
    await thread.getByPlaceholder('Напиши ответ...').fill(replyText)
    await thread.locator('.reply-form').getByRole('button', { name: 'Ответить' }).click()
    await expect(thread.locator('.comment-item.is-reply', { hasText: replyText })).toBeVisible()
    await other.close()

    // ...а у SECOND ответ появляется в ветке и в колокольчике.
    await expect(root.locator('.comment-item.is-reply', { hasText: replyText })).toBeVisible()
    await expect(page.locator('.notif-widget .badge')).toHaveText(/[1-9]/)
    const list = await (await page.request.get('/api/notifications')).json()
    expect(list.unread).toBeGreaterThan(0)
  })

  test('реакция ставится один раз и снимается повторным кликом', async ({ page }) => {
    await open(page, discussionUrl)
    const item = page.locator('.comment-item').first()
    const like = item.locator('.reaction-btn').first()
    const before = Number((await like.innerText()).replace(/\D/g, '') || 0)

    await like.click()
    await expect(like).toHaveClass(/active/)
    await expect(like).toHaveText(new RegExp(String(before + 1)))

    await like.click()
    await expect(like).not.toHaveClass(/active/)
  })

  test('администратор удаляет комментарий', async ({ page }) => {
    await login(page, ADMIN)
    await open(page, discussionUrl)
    const section = page.locator('.comments-section')
    const text = `На удаление ${stamp()}`
    await section.getByPlaceholder('Что думаешь об этой главе?').fill(text)
    await section.getByRole('button', { name: 'Отправить' }).click()
    const item = section.locator('.comment-item', { hasText: text })
    await expect(item).toBeVisible()

    page.once('dialog', d => d.accept())
    await item.getByRole('button', { name: 'Удалить' }).click()
    await expect(item).toHaveCount(0)
  })

  test('отзыв о проекте на главной попадает в список', async ({ page }) => {
    await open(page, '/')
    const section = page.locator('#reviews .comments-section')
    const text = `Спасибо за перевод ${stamp()}`
    await section.getByPlaceholder('Что думаешь о проекте?').fill(text)
    await section.getByRole('button', { name: 'Отправить' }).click()
    await expect(section.locator('.comment-item', { hasText: text })).toBeVisible()
    await expect(section.locator('.comment-item', { hasText: text }).locator('.comment-name')).toHaveText('Гость')
  })
})
