import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { sendBrowserRedirect } from './browser-redirect'
import { issueTicket } from './handoff'
import { afterLogin, loginWithProvider } from './identity'

/**
 * Возврат от телеграма. Поля профиля приходят подписанными: HMAC-SHA256 от
 * «ключ=значение», отсортированных по имени, на ключе SHA256(токен бота).
 * Телеграм — не OAuth, готового обработчика в модуле нет, проверка своя.
 *
 * Два входа — /auth/telegram/done и /auth/telegram/done/<зеркало> — делают
 * одно и то же; второй в конце не ставит сессию здесь, а передаёт вход на
 * зеркало билетом (см. utils/handoff.ts): CDN зеркала не пропустил бы подпись
 * телеграма в адресе, поэтому возвращаться приходится на основной домен.
 */

/** Поля, которые подписывает телеграм. Ничего постороннего в проверочную строку
 *  попадать не должно — иначе подпись не сойдётся. */
const SIGNED_FIELDS = ['auth_date', 'first_name', 'id', 'last_name', 'photo_url', 'username']

/** Данные живут сутки: без проверки времени подсмотренная однажды ссылка
 *  пускала бы в аккаунт вечно. */
const MAX_AGE_SEC = 86_400

/**
 * Телеграм умеет вернуть ответ и во фрагменте адреса — сервер фрагмента не
 * видит. Тогда отдаём страничку, которая перекладывает его в строку запроса и
 * заходит сюда же ещё раз.
 */
const HASH_SHIM = `<!doctype html><meta charset="utf-8"><title>Входим…</title>
<script>
(function () {
  var raw = location.hash.slice(1)
  if (!raw) return location.replace('/login?error=telegram&reason=empty')

  var packed = /^tgAuthResult=(.+)$/.exec(raw)
  if (packed) {
    try {
      var data = JSON.parse(atob(packed[1].replace(/-/g, '+').replace(/_/g, '/')))
      var query = Object.keys(data)
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]) })
        .join('&')
      return location.replace(location.pathname + '?' + query)
    } catch (e) {
      return location.replace('/login?error=telegram&reason=unpack')
    }
  }

  location.replace(location.pathname + '?' + raw)
})()
</script>`

class TelegramLoginError extends Error {
  constructor(public reason: string, message: string) { super(message) }
}

/** Подпись, которую телеграм ставит на поля профиля. Нужна и тестам — чтобы
 *  собрать честный возврат без самого телеграма. */
export function telegramSignature(botToken: string, fields: Record<string, string | undefined>): string {
  const checkString = SIGNED_FIELDS
    .filter(key => fields[key] !== undefined)
    .map(key => `${key}=${fields[key]}`)
    .join('\n')
  const secret = createHash('sha256').update(botToken).digest()
  return createHmac('sha256', secret).update(checkString).digest('hex')
}

/**
 * Завершить вход через телеграм. `mirror` — хост зеркала, откуда человек начал
 * вход, или null, если вошёл прямо здесь.
 */
export async function finishTelegramLogin(event: H3Event, mirror: string | null) {
  const { botToken } = useRuntimeConfig(event).telegram
  if (!botToken) throw createError({ statusCode: 503, message: 'Телеграм-бот не настроен' })

  const query = getQuery(event) as Record<string, string | undefined>

  if (!query.hash) {
    setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
    return HASH_SHIM
  }

  try {
    const given = Buffer.from(query.hash)
    const wanted = Buffer.from(telegramSignature(botToken, query))
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
      throw new TelegramLoginError('signature', 'Подпись не сходится')
    }

    const authDate = Number(query.auth_date)
    if (!authDate || Math.abs(Date.now() / 1000 - authDate) > MAX_AGE_SEC) {
      throw new TelegramLoginError('expired', 'Ссылка входа устарела')
    }

    // Подпись без идентификатора формально сходится, а привязывать её не к чему.
    if (!/^\d+$/.test(query.id ?? '')) {
      throw new TelegramLoginError('no-id', 'Нет идентификатора')
    }

    const name = [query.first_name, query.last_name].filter(Boolean).join(' ').trim()

    const { user, created } = await loginWithProvider(event, 'telegram', {
      id: String(query.id),
      displayName: name || query.username || null,
      photoUrl: query.photo_url ?? null,
    })

    if (mirror) {
      const ticket = issueTicket({ userId: user.id, created })
      return sendBrowserRedirect(event, `https://${mirror}/auth/handoff?t=${ticket}`)
    }

    return sendBrowserRedirect(event, afterLogin(event, created))
  } catch (error) {
    // Любой сбой — на страницу входа с причиной, как у Google: голая страница
    // ошибки человеку ничего не объяснит, а нам нужен след в логах.
    const e = error as { reason?: string; statusCode?: number; message?: string }
    const reason = e.reason ?? `${e.statusCode ?? ''}:${String(e.message ?? 'unknown').slice(0, 60)}`
    console.error('[auth] telegram:', reason)
    return sendBrowserRedirect(event, `/login?error=telegram&reason=${encodeURIComponent(reason)}`)
  }
}
