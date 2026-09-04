import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { afterLogin, loginWithProvider } from '../../../utils/identity'

/**
 * Возврат от телеграма. Поля профиля приходят подписанными: HMAC-SHA256 от
 * «ключ=значение», отсортированных по имени, на ключе SHA256(токен бота).
 * Телеграм — не OAuth, готового обработчика в модуле нет, проверка своя.
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
  if (!raw) return location.replace('/login?error=telegram')

  var packed = /^tgAuthResult=(.+)$/.exec(raw)
  if (packed) {
    try {
      var data = JSON.parse(atob(packed[1].replace(/-/g, '+').replace(/_/g, '/')))
      var query = Object.keys(data)
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]) })
        .join('&')
      return location.replace(location.pathname + '?' + query)
    } catch (e) {
      return location.replace('/login?error=telegram')
    }
  }

  location.replace(location.pathname + '?' + raw)
})()
</script>`

export default defineEventHandler(async (event) => {
  const { botToken } = useRuntimeConfig(event).telegram
  if (!botToken) throw createError({ statusCode: 503, message: 'Телеграм-бот не настроен' })

  const query = getQuery(event) as Record<string, string | undefined>

  if (!query.hash) {
    setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
    return HASH_SHIM
  }

  const checkString = SIGNED_FIELDS
    .filter(key => query[key] !== undefined)
    .map(key => `${key}=${query[key]}`)
    .join('\n')

  const secret = createHash('sha256').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(checkString).digest('hex')

  const given = Buffer.from(query.hash)
  const wanted = Buffer.from(expected)
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    throw createError({ statusCode: 401, message: 'Подпись не сходится' })
  }

  const authDate = Number(query.auth_date)
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > MAX_AGE_SEC) {
    throw createError({ statusCode: 401, message: 'Ссылка входа устарела' })
  }

  // Подпись без идентификатора формально сходится, а привязывать её не к чему.
  if (!/^\d+$/.test(query.id ?? '')) {
    throw createError({ statusCode: 400, message: 'Нет идентификатора' })
  }

  const name = [query.first_name, query.last_name].filter(Boolean).join(' ').trim()

  const { created } = await loginWithProvider(event, 'telegram', {
    id: String(query.id),
    displayName: name || query.username || null,
    photoUrl: query.photo_url ?? null,
  })

  return sendRedirect(event, afterLogin(event, created))
})
