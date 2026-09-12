import { blockExternalFetch } from '../utils/offline-guard'

/*
  Тестовый режим — без интернета. Тесты поднимают сайт с пустыми ключами
  телеграма, но полагаться на одни переменные окружения нельзя: одна забытая
  строка в .env — и прогон отправит «новую главу» живым читателям в канал.
  Поэтому под E2E_OFFLINE=1 любой запрос сервера наружу обрывается ещё до сети.
  $fetch и ofetch ходят через globalThis.fetch, так что подмены его одного
  достаточно. На боевом сервере переменной нет, и плагин молчит.
*/
export default defineNitroPlugin(() => {
  if (process.env.E2E_OFFLINE !== '1') return

  globalThis.fetch = blockExternalFetch(globalThis.fetch, url => {
    console.error(`[offline-guard] заблокирован запрос наружу: ${url}`)
  })

  console.log('[offline-guard] тестовый режим: запросы во внешний мир заблокированы')
})
