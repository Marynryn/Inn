import { mkdirSync, writeFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { test, expect } from '../e2e/helpers'
import { CHAPTERS } from '../e2e/fixtures'
import { createBrowserTools, type Finding } from './browser-tools'

/*
  Исследователь. В отличие от e2e-тестов у него нет сценария: он получает
  браузер, описание сайта и задание «найди, что сломано», а дальше решает сам,
  куда идти и что нажимать. Каждый найденный баг он записывает через
  report_finding; в конце пишет отчёт в .data/explorer-report.md.

  Запуск:  npm run test:explore
  Нужен ANTHROPIC_API_KEY (или профиль `ant auth login`). Настройки через env:
    EXPLORER_STEPS   — потолок ходов (запросов к модели), по умолчанию 60
    EXPLORER_EFFORT  — low | medium | high | xhigh, по умолчанию high
    EXPLORER_FOCUS   — на чём сосредоточиться, свободным текстом
*/

const STEPS = Number(process.env.EXPLORER_STEPS || 60)
const EFFORT = (process.env.EXPLORER_EFFORT || 'high') as 'low' | 'medium' | 'high' | 'xhigh'
const FOCUS = process.env.EXPLORER_FOCUS || ''

const SYSTEM = `Ты — дотошный QA-тестировщик сайта «Странствующая Таверна» (taverna-book.com): русский фанатский перевод романа The Wandering Inn. Сайт на Nuxt, ты работаешь с его тестовой копией через инструменты браузера. Ломать можно всё — данные тестовые.

Что есть на сайте:
- Главная (/): оглавление по томам (аккордеон), отзывы о проекте (комментарии без главы), ссылки в телеграм и на поддержку.
- Глава (/chapter/1-01): текст, кнопка скачать epub, навигация к соседним главам, закладка прочитанного для вошедших.
- Обсуждение главы (/chapter/1-01/comments): комментарии, ответы веткой, реакции 👍👎, спойлеры, смайлы. Гость подписывается сам, вошедший — именем из профиля; чужое имя занять нельзя. Обновления приходят по вебсокету.
- Игра (/game): «Кто из таверны?» — угадать персонажа по признакам, режимы «Персонаж дня» и «Свободная игра», рейтинг.
- Вход (/login): кнопки Google/Telegram (в тесте выключены), форма пароля скрыта, видна по /login?pw=1.
- Профиль (/profile): имя под комментариями, аватарка, рамки, выход.
- Уведомления: колокольчик у вошедших, приходят на ответы.
- Панель (/admin): только администратору; читателя должно уводить.
- /about, страницы ошибок 404/403.

Тестовые данные: главы ${CHAPTERS.map(c => `${c.id} «${c.title}»`).join(', ')}. Аккаунты через инструмент login: reader, second (два читателя), admin.

Как работать:
1. Планируй: пройди все разделы, гостем и вошедшим, на desktop и mobile. Не застревай на одном месте.
2. Ищи настоящие поломки: ошибки в консоли, 4xx/5xx, сценарии, которые не доводятся до конца, права (читатель видит чужое или админское), потерю данных, вёрстку (layout_check, screenshot на mobile), некорректные тексты, ссылки в никуда.
3. Пробуй граничные случаи: пустые поля, очень длинный текст, спецсимволы и HTML в комментариях, повторные клики, двойная отправка, назад/вперёд в браузере, прямые запросы api_request к чужим и админским ручкам.
4. После каждого сценария смотри console_log.
5. Нашёл проблему — воспроизведи ещё раз и запиши через report_finding. Не записывай догадки и то, что так задумано (например, выключенные в тесте Google/Telegram — не баг; отсутствие рамок в каталоге — не баг).
6. У тебя ${STEPS} ходов. Оставь последний ход на итог: краткая сводка — что проверил, что работает, что сломано, и что бы ты проверил дальше.
${FOCUS ? `\nОсобое внимание: ${FOCUS}` : ''}
Отвечай по-русски. Между инструментами пиши коротко: что проверяешь и что увидел.`

test.describe.configure({ timeout: 45 * 60_000 })

test('исследователь ищет проблемы на сайте', async ({ page, context }, testInfo) => {
  let client: Anthropic
  try {
    client = new Anthropic()
  } catch (e) {
    test.skip(true, `Нет ключа API: задай ANTHROPIC_API_KEY или войди через ant auth login. (${(e as Error).message})`)
    return
  }
  const findings: Finding[] = []
  const tools = createBrowserTools(page, context, findings)
  const log: string[] = []
  const say = (line: string) => { log.push(line); console.log(line) }

  await page.setViewportSize({ width: 1280, height: 800 })

  const runner = client.beta.messages.toolRunner({
    model: 'claude-opus-5',
    max_tokens: 16_000,
    betas: ['compact-2026-01-12', 'server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: EFFORT },
    // Aria-деревья быстро заполняют контекст: старые ходы сервер сожмёт сам.
    context_management: { edits: [{ type: 'compact_20260112' }] },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools,
    max_iterations: STEPS,
    messages: [{ role: 'user', content: 'Начинай. Открой главную и составь план, затем иди по нему.' }],
  })

  let usage = { input: 0, output: 0, cacheRead: 0 }
  let step = 0
  let final: Anthropic.Beta.BetaMessage | null = null

  try {
    for await (const message of runner) {
      step++
      usage.input += message.usage.input_tokens
      usage.output += message.usage.output_tokens
      usage.cacheRead += message.usage.cache_read_input_tokens ?? 0
      for (const block of message.content) {
        if (block.type === 'text' && block.text.trim()) say(`[${step}] ${block.text.trim()}`)
        else if (block.type === 'tool_use') say(`[${step}] → ${block.name}(${JSON.stringify(block.input).slice(0, 160)})`)
      }
      if (message.stop_reason === 'refusal') say(`[${step}] Модель отказалась: ${JSON.stringify(message.stop_details)}`)
      final = message
    }
  } catch (e) {
    // Ключа нет (SDK замечает это на первом запросе) или он не подошёл —
    // пропуск с подсказкой, а не красный прогон.
    const noAuth = e instanceof Anthropic.AuthenticationError
      || (e instanceof Error && /resolve authentication method/i.test(e.message))
    if (noAuth) {
      test.skip(true, `Нет ключа API: задай ANTHROPIC_API_KEY или войди через ant auth login. (${(e as Error).message})`)
    }
    throw e
  }

  const summary = final?.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n') ?? ''
  const report = renderReport(findings, summary, log, usage, step)

  mkdirSync('.data', { recursive: true })
  writeFileSync('.data/explorer-report.md', report)
  await testInfo.attach('explorer-report', { body: report, contentType: 'text/markdown' })
  console.log(`\n${report}`)

  // Критичное — красный прогон: пусть CI не молчит.
  const critical = findings.filter(f => f.severity === 'critical')
  expect(critical, `Критичные находки:\n${critical.map(f => `- ${f.title}`).join('\n')}`).toHaveLength(0)
})

function renderReport(findings: Finding[], summary: string, log: string[], usage: { input: number; output: number; cacheRead: number }, steps: number) {
  const order = { critical: 0, major: 1, minor: 2, cosmetic: 3 }
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity])
  const lines = [
    `# Отчёт исследователя — ${new Date().toLocaleString('ru-RU')}`,
    '',
    `Ходов: ${steps}. Токены: вход ${usage.input} (из кэша ${usage.cacheRead}), выход ${usage.output}.`,
    '',
    `## Находки (${sorted.length})`,
    '',
  ]
  if (!sorted.length) lines.push('Ничего не найдено.', '')
  for (const [i, f] of sorted.entries()) {
    lines.push(
      `### ${i + 1}. [${f.severity}] ${f.title}`,
      `Где: ${f.url}`,
      '',
      `**Шаги:** ${f.steps}`,
      `**Ожидалось:** ${f.expected}`,
      `**На деле:** ${f.actual}`,
      '',
    )
  }
  lines.push('## Итог от исследователя', '', summary || '_(итог не написан — ходы кончились раньше)_', '')
  lines.push('## Ход исследования', '', ...log.map(l => `- ${l}`), '')
  return lines.join('\n')
}
