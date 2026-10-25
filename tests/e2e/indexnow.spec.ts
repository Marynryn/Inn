import { test, expect } from './helpers'
import { INDEXNOW_KEY, indexNowRequest } from '../../server/utils/indexnow'

/*
  IndexNow: при публикации главы сервер сообщает о ней Яндексу. Сам запрос в
  тесте не уходит — стенд на http://localhost, а сверх того E2E_OFFLINE рвёт
  всё внешнее. Проверяется то, от чего зависит, примет ли Яндекс адреса в бою:
  файл с ключом в корне сайта и тело запроса.
*/
test.describe('IndexNow для Яндекса', () => {
  test('файл с ключом лежит в корне сайта и содержит только ключ', async ({ page }) => {
    const res = await page.request.get(`/${INDEXNOW_KEY}.txt`)
    expect(res.status()).toBe(200)
    expect((await res.text()).trim()).toBe(INDEXNOW_KEY)
  })

  test('боевой сайт шлёт адрес главы как в sitemap, локальный — ничего', () => {
    expect(indexNowRequest('https://taverna-book.com', ['5.11 E', 'I.4.1'])).toEqual({
      host: 'taverna-book.com',
      key: INDEXNOW_KEY,
      keyLocation: `https://taverna-book.com/${INDEXNOW_KEY}.txt`,
      urlList: [
        'https://taverna-book.com/chapter/5-11-e',
        'https://taverna-book.com/chapter/i-4-1',
      ],
    })

    expect(indexNowRequest('http://localhost:3100', ['5.11 E'])).toBeNull()
    expect(indexNowRequest('https://localhost', ['5.11 E'])).toBeNull()
    expect(indexNowRequest('https://taverna-book.com', [])).toBeNull()
  })
})
