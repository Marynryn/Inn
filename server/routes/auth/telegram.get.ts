import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { loginWithProvider, takeNext } from '../../utils/identity'

/**
 * Возврат от виджета телеграма. Виджет присылает поля профиля в query и подпись:
 * HMAC-SHA256 от «ключ=значение», отсортированных по имени, на ключе
 * SHA256(токен бота). Телеграм — не OAuth, готового обработчика в модуле нет,
 * поэтому проверка своя.
 */

/** Поля, которые подписывает телеграм. Всё остальное в адресе (наш next) в
 *  проверочную строку попадать не должно — иначе подпись не сойдётся. */
const SIGNED_FIELDS = ['auth_date', 'first_name', 'id', 'last_name', 'photo_url', 'username']

/** Данные виджета живут сутки: без проверки времени подсмотренная однажды
 *  ссылка пускала бы в аккаунт вечно. */
const MAX_AGE_SEC = 86_400

export default defineEventHandler(async (event) => {
  const { botToken } = useRuntimeConfig(event).telegram
  if (!botToken) throw createError({ statusCode: 503, message: 'Телеграм-бот не настроен' })

  const query = getQuery(event) as Record<string, string | undefined>
  const hash = query.hash
  if (!hash) throw createError({ statusCode: 400, message: 'Нет подписи' })

  const checkString = SIGNED_FIELDS
    .filter(key => query[key] !== undefined)
    .map(key => `${key}=${query[key]}`)
    .join('\n')

  const secret = createHash('sha256').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(checkString).digest('hex')

  const given = Buffer.from(hash)
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

  await loginWithProvider(event, 'telegram', {
    id: String(query.id),
    displayName: name || query.username || null,
    photoUrl: query.photo_url ?? null,
  })

  return sendRedirect(event, takeNext(event))
})
