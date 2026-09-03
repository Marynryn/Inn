/** Шлёт сообщение в канал. Возвращает false, если бот не настроен — тогда главы нельзя считать оповещёнными. */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  const config = useRuntimeConfig()
  const { botToken, chatId, threadId } = config.telegram
  if (!botToken || !chatId) return false

  await $fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    body: {
      chat_id: chatId,
      message_thread_id: threadId ? Number(threadId) : undefined,
      text,
    },
  })

  return true
}

/**
 * Числовой идентификатор бота — префикс токена до двоеточия. Не секрет: именно
 * его страница входа телеграма получает открытым текстом.
 */
export function telegramBotId(): string | null {
  const { botToken } = useRuntimeConfig().telegram
  const id = botToken?.split(':')[0]
  return id && /^\d+$/.test(id) ? id : null
}

const availability = new Map<string, { ok: boolean; until: number }>()
const AVAILABILITY_TTL = 10 * 60_000

/**
 * Пустит ли телеграм входить с этого адреса. Вход работает только на домене,
 * выданном боту через /setdomain, — на всех прочих, включая localhost, телеграм
 * отвечает страницей «Bot domain invalid». Спрашиваем его самого и запоминаем
 * ответ на десять минут, чтобы не рисовать кнопку, ведущую в тупик.
 *
 * Молчит телеграм — считаем недоступным: лучше не показать кнопку, чем показать
 * неработающую.
 */
export async function telegramLoginAvailable(origin: string): Promise<boolean> {
  const cached = availability.get(origin)
  if (cached && cached.until > Date.now()) return cached.ok

  const botId = telegramBotId()
  if (!botId) return false

  let ok = false
  try {
    const page = await $fetch<string>('https://oauth.telegram.org/auth', {
      query: { bot_id: botId, origin },
      responseType: 'text',
      timeout: 4000,
    })
    ok = !page.includes('Bot domain invalid')
  } catch {
    ok = false
  }

  availability.set(origin, { ok, until: Date.now() + AVAILABILITY_TTL })
  return ok
}
