import { test, expect } from './helpers'
import { CHAPTERS } from './fixtures'
import { createBrowserTools, type Finding } from '../explorer/browser-tools'

/*
  Инструменты исследователя без самой модели: зовём их напрямую, как звала бы
  она, и смотрим, что они видят страницу, находят элементы по ref и не падают.
  Так поломка «рук» агента всплывает в обычном прогоне, а не на платном.
*/
test.describe('Инструменты исследователя', () => {
  test('видит страницу, кликает по ref, заполняет поля и ходит в API', async ({ page, context }) => {
    const findings: Finding[] = []
    const tools = createBrowserTools(page, context, findings)
    const tool = (name: string) => {
      const t = tools.find(t => t.name === name)
      if (!t) throw new Error(`Нет инструмента ${name}`)
      return (input: Record<string, unknown> = {}) => t.run(t.parse(input) as never)
    }

    // Навигация отдаёт aria-дерево с ref-метками.
    const home = String(await tool('navigate')({ path: '/' }))
    expect(home).toContain('HTTP 200')
    expect(home).toContain('Оглавление')
    expect(home).toMatch(/\[ref=e\d+\]/)

    // Ref из дерева ведёт к настоящему элементу: раскрываем первый том.
    const ref = home.match(/button "Том 1[^"]*" \[ref=(e\d+)\]/)?.[1]
    expect(ref, 'в дереве нет кнопки тома').toBeTruthy()
    const after = String(await tool('click')({ ref }))
    expect(after).toContain(CHAPTERS[0]!.title)

    // Поля заполняются по placeholder, API — с куками страницы.
    expect(String(await tool('fill')({ placeholder: 'Что думаешь о проекте?', value: 'проба' }))).toContain('проба')
    expect(String(await tool('api_request')({ method: 'GET', path: '/api/chapters' }))).toContain(CHAPTERS[0]!.id)
    expect(String(await tool('api_request')({ method: 'GET', path: '/etc/passwd' }))).toContain('Только пути /api/')

    // Вход меняет, кого видит сайт.
    expect(String(await tool('login')({ as: 'reader' }))).toContain('Вошёл как reader')
    expect(String(await tool('api_request')({ method: 'GET', path: '/api/auth/me' }))).toContain('reader@test.local')
    expect(String(await tool('api_request')({ method: 'GET', path: '/api/admin/stats' }))).toContain('HTTP 403')
    await tool('logout')()

    // Проверки вёрстки и консоли, скриншот как картинка, находка в отчёте.
    expect(String(await tool('set_viewport')({ device: 'mobile' }))).toContain('mobile')
    expect(String(await tool('layout_check')())).toContain('Вёрстка в порядке')
    const shot = await tool('screenshot')() as Array<{ type: string }>
    expect(shot[0]?.type).toBe('image')
    const log = String(await tool('console_log')())
    expect(log).not.toMatch(/\[pageerror\]/)

    await tool('report_finding')({
      severity: 'minor', title: 'проба', steps: '1', expected: 'a', actual: 'b',
    })
    expect(findings).toHaveLength(1)
    expect(findings[0]!.url).toContain('localhost')
  })
})
