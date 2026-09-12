import type { Page, BrowserContext } from '@playwright/test'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { ADMIN, READER, SECOND } from '../e2e/fixtures'

/*
  Руки и глаза исследователя. Каждая функция — инструмент, который модель зовёт
  по имени; результат возвращается ей текстом (или картинкой у скриншота).
  Страница показывается не HTML, а aria-деревом с метками [ref=eN]: оно в разы
  короче, а по метке элемент находится однозначно.
*/

export type Finding = {
  severity: 'critical' | 'major' | 'minor' | 'cosmetic'
  title: string
  url: string
  steps: string
  expected: string
  actual: string
}

const ACCOUNTS = { admin: ADMIN, reader: READER, second: SECOND }

const SNAPSHOT_LIMIT = 12_000

export function createBrowserTools(page: Page, context: BrowserContext, findings: Finding[]) {
  // Ошибки консоли и упавшие запросы копятся между вызовами console_log.
  const consoleErrors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoleErrors.push(`[${msg.type()}] ${msg.text()}`)
  })
  page.on('pageerror', err => consoleErrors.push(`[pageerror] ${err.message}`))
  page.on('response', res => {
    if (res.status() >= 400 && !res.url().includes('/api/auth/me')) {
      consoleErrors.push(`[http ${res.status()}] ${res.request().method()} ${res.url()}`)
    }
  })

  const snapshot = async () => {
    await page.waitForLoadState('domcontentloaded')
    const tree = await page.locator('body').ariaSnapshot({ mode: 'ai' })
    const head = `URL: ${page.url()}\nTitle: ${await page.title()}\n\n`
    return tree.length > SNAPSHOT_LIMIT
      ? head + tree.slice(0, SNAPSHOT_LIMIT) + `\n…(обрезано, всего ${tree.length} символов — прокрути или уточни)`
      : head + tree
  }

  const byRef = (ref: string) => page.locator(`aria-ref=${ref.replace(/^\[?ref=|\]$/g, '')}`)

  const navigate = betaZodTool({
    name: 'navigate',
    description: 'Открыть страницу сайта по пути (например "/", "/game", "/chapter/1-01/comments"). Возвращает aria-дерево страницы.',
    inputSchema: z.object({ path: z.string().describe('Путь от корня сайта, начинается с /') }),
    run: async ({ path }) => {
      const res = await page.goto(path, { waitUntil: 'networkidle' }).catch(e => { throw new Error(`goto failed: ${e.message}`) })
      return `HTTP ${res?.status() ?? '?'}\n` + await snapshot()
    },
  })

  const look = betaZodTool({
    name: 'snapshot',
    description: 'Посмотреть текущую страницу заново (aria-дерево с ref-метками). Зови после действий, чтобы увидеть результат.',
    inputSchema: z.object({}),
    run: snapshot,
  })

  const screenshot = betaZodTool({
    name: 'screenshot',
    description: 'Скриншот видимой части страницы — для проверки внешнего вида: наложения, обрезанный текст, пустые места.',
    inputSchema: z.object({ fullPage: z.boolean().optional().describe('Вся страница целиком, а не только видимая часть') }),
    run: async ({ fullPage }) => {
      const buf = await page.screenshot({ fullPage: Boolean(fullPage), type: 'jpeg', quality: 60 })
      return [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } }]
    },
  })

  const click = betaZodTool({
    name: 'click',
    description: 'Кликнуть по элементу. Укажи ref из aria-дерева (например "e12") — это самый надёжный способ. Либо role+name, либо text.',
    inputSchema: z.object({
      ref: z.string().optional(),
      role: z.string().optional().describe('ARIA-роль: button, link, checkbox…'),
      name: z.string().optional().describe('Доступное имя элемента (текст кнопки/ссылки)'),
      text: z.string().optional().describe('Видимый текст, если ref и role не подходят'),
      nth: z.number().int().optional().describe('Который из совпавших, с нуля'),
    }),
    run: async ({ ref, role, name, text, nth }) => {
      let loc = ref ? byRef(ref)
        : role ? page.getByRole(role as any, name ? { name } : undefined)
        : text ? page.getByText(text)
        : null
      if (!loc) return 'Нужен ref, role или text'
      if (nth != null) loc = loc.nth(nth)
      const count = await loc.count()
      if (count === 0) return 'Элемент не найден. Сделай snapshot и уточни.'
      if (count > 1 && nth == null) return `Совпало ${count} элементов — укажи nth или ref.`
      page.once('dialog', d => d.accept())
      await loc.click({ timeout: 5_000 })
      await page.waitForLoadState('networkidle').catch(() => {})
      return await snapshot()
    },
  })

  const fill = betaZodTool({
    name: 'fill',
    description: 'Ввести текст в поле. Укажи ref из aria-дерева или placeholder/label поля. Старое содержимое заменяется.',
    inputSchema: z.object({
      ref: z.string().optional(),
      placeholder: z.string().optional(),
      label: z.string().optional(),
      value: z.string(),
    }),
    run: async ({ ref, placeholder, label, value }) => {
      const loc = ref ? byRef(ref) : placeholder ? page.getByPlaceholder(placeholder) : label ? page.getByLabel(label) : null
      if (!loc) return 'Нужен ref, placeholder или label'
      if ((await loc.count()) === 0) return 'Поле не найдено. Сделай snapshot и уточни.'
      await loc.first().fill(value, { timeout: 5_000 })
      return `Введено. Значение поля сейчас: ${JSON.stringify(await loc.first().inputValue())}`
    },
  })

  const press = betaZodTool({
    name: 'press',
    description: 'Нажать клавишу на сфокусированном элементе: Enter, Escape, ArrowDown, Tab…',
    inputSchema: z.object({ key: z.string() }),
    run: async ({ key }) => {
      await page.keyboard.press(key)
      await page.waitForLoadState('networkidle').catch(() => {})
      return await snapshot()
    },
  })

  const scroll = betaZodTool({
    name: 'scroll',
    description: 'Прокрутить страницу вниз или вверх на экран, либо в самый низ/верх.',
    inputSchema: z.object({ to: z.enum(['down', 'up', 'bottom', 'top']) }),
    run: async ({ to }) => {
      await page.evaluate((to) => {
        const h = window.innerHeight
        if (to === 'down') window.scrollBy(0, h * 0.9)
        else if (to === 'up') window.scrollBy(0, -h * 0.9)
        else if (to === 'bottom') window.scrollTo(0, document.body.scrollHeight)
        else window.scrollTo(0, 0)
      }, to)
      await page.waitForTimeout(300)
      const pos = await page.evaluate(() => `${Math.round(window.scrollY)} / ${document.body.scrollHeight - window.innerHeight}`)
      return `Прокрутка: ${pos}`
    },
  })

  const login = betaZodTool({
    name: 'login',
    description: 'Войти под тестовым аккаунтом: reader (обычный читатель), second (ещё один читатель, для проверки взаимодействий) или admin. Гостем ты являешься по умолчанию и после logout.',
    inputSchema: z.object({ as: z.enum(['reader', 'second', 'admin']) }),
    run: async ({ as }) => {
      const res = await page.request.post('/api/auth/login', { data: ACCOUNTS[as] })
      if (!res.ok()) return `Вход не удался: ${res.status()} ${await res.text()}`
      await page.reload({ waitUntil: 'networkidle' })
      return `Вошёл как ${as} (${ACCOUNTS[as].email}). Страница перезагружена.\n` + await snapshot()
    },
  })

  const logout = betaZodTool({
    name: 'logout',
    description: 'Выйти из аккаунта и снова стать гостем.',
    inputSchema: z.object({}),
    run: async () => {
      await page.request.post('/api/auth/logout')
      await page.reload({ waitUntil: 'networkidle' })
      return 'Вышел. Теперь гость.'
    },
  })

  const viewport = betaZodTool({
    name: 'set_viewport',
    description: 'Переключить размер экрана: desktop (1280×800) или mobile (390×844, как телефон).',
    inputSchema: z.object({ device: z.enum(['desktop', 'mobile']) }),
    run: async ({ device }) => {
      await page.setViewportSize(device === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 800 })
      return `Экран: ${device}`
    },
  })

  const api = betaZodTool({
    name: 'api_request',
    description: 'Прямой запрос к API сайта с текущими куками (для проверки границ: чужие данные, лимиты, права). Только GET/POST/PUT/DELETE на /api/…',
    inputSchema: z.object({
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
      path: z.string().describe('Путь, начинается с /api/'),
      json: z.record(z.string(), z.unknown()).optional().describe('Тело запроса как JSON'),
    }),
    run: async ({ method, path, json }) => {
      if (!path.startsWith('/api/')) return 'Только пути /api/…'
      const res = await page.request.fetch(path, { method, data: json })
      const text = await res.text()
      return `HTTP ${res.status()}\n${text.slice(0, 3000)}`
    },
  })

  const consoleLog = betaZodTool({
    name: 'console_log',
    description: 'Ошибки консоли браузера и запросы, вернувшие 4xx/5xx, накопленные с прошлого вызова. Проверяй после каждого сценария.',
    inputSchema: z.object({}),
    run: async () => {
      const out = consoleErrors.splice(0).join('\n')
      return out || 'Чисто: ошибок и упавших запросов не было.'
    },
  })

  const layoutCheck = betaZodTool({
    name: 'layout_check',
    description: 'Быстрая проверка вёрстки текущей страницы: горизонтальная прокрутка, элементы за краем экрана, картинки без alt, битые картинки.',
    inputSchema: z.object({}),
    run: async () => page.evaluate(() => {
      const issues: string[] = []
      const doc = document.documentElement
      if (doc.scrollWidth > doc.clientWidth + 1) issues.push(`Горизонтальная прокрутка: ширина контента ${doc.scrollWidth}px при экране ${doc.clientWidth}px`)
      // Торчащее за край считается только там, где его ничто не обрезает:
      // декор под overflow: hidden у родителя прокрутки не создаёт.
      const clipped = (el: Element) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          if (getComputedStyle(p).overflowX !== 'visible') return true
        }
        return false
      }
      for (const el of Array.from(document.querySelectorAll('body *')).slice(0, 3000)) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.right > doc.clientWidth + 8 && getComputedStyle(el).position !== 'fixed' && !clipped(el)) {
          issues.push(`За правым краем: <${el.tagName.toLowerCase()} class="${(el as HTMLElement).className}"> right=${Math.round(r.right)}`)
          if (issues.length > 8) break
        }
      }
      for (const img of Array.from(document.images)) {
        if (!img.hasAttribute('alt')) issues.push(`Картинка без alt: ${img.src.slice(-60)}`)
        if (img.complete && img.naturalWidth === 0 && img.src) issues.push(`Битая картинка: ${img.src.slice(-80)}`)
      }
      return issues.length ? issues.join('\n') : 'Вёрстка в порядке.'
    }),
  })

  const report = betaZodTool({
    name: 'report_finding',
    description: 'Записать найденную проблему в отчёт. Одна проблема — один вызов. Только то, что действительно воспроизвёл.',
    inputSchema: z.object({
      severity: z.enum(['critical', 'major', 'minor', 'cosmetic']).describe('critical — потеря данных/дыра в правах/страница не работает; major — сценарий сломан; minor — неудобство; cosmetic — внешний вид'),
      title: z.string().describe('Короткий заголовок'),
      steps: z.string().describe('Как воспроизвести, по шагам'),
      expected: z.string(),
      actual: z.string(),
    }),
    run: async (input) => {
      findings.push({ ...input, url: page.url() })
      return `Записано (#${findings.length}).`
    },
  })

  return [navigate, look, screenshot, click, fill, press, scroll, login, logout, viewport, api, consoleLog, layoutCheck, report]
}
