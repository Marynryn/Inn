/*
  Запуск сайта для тестов. Хранилище вычищается перед стартом, чтобы каждый
  прогон начинался с одной и той же пустой базы, а переменные окружения
  выставляются здесь же — .env проекта их не перебьёт: Nuxt не трогает то, что
  уже есть в process.env.
*/
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const PORT = process.env.E2E_PORT || '3100'
const storage = resolve('.data/e2e')

rmSync(storage, { recursive: true, force: true })
mkdirSync(storage, { recursive: true })

const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT,
  STORAGE_DIR: storage,
  NUXT_SESSION_PASSWORD: 'e2e-session-password-not-secret-but-long-enough-0123456789',
  // Тесты ходят по http — «secure»-куку браузер бы не принял.
  NUXT_SESSION_COOKIE_SECURE: 'false',
  NUXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
  // Внешние сервисы выключены дважды: ключи пустые, и сверх того сервер под
  // E2E_OFFLINE не выпускает наружу ни одного запроса (server/plugins/offline-guard.ts).
  // Чтобы прогон не написал живым читателям в канал, даже если в .env что-то есть.
  E2E_OFFLINE: '1',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_CHANNEL_ID: '',
  TELEGRAM_THREAD_ID: '',
  NUXT_OAUTH_GOOGLE_CLIENT_ID: '',
  NUXT_OAUTH_GOOGLE_CLIENT_SECRET: '',
  NOTIFY_SECRET: 'e2e',
  GAME_SECRET: 'e2e-game',
}

// Nuxt зовём напрямую через node, без npx и оболочки: иначе при остановке
// умирала бы только оболочка, а сервер оставался висеть на порту.
const child = spawn(process.execPath, [resolve('node_modules/nuxt/bin/nuxt.mjs'), 'dev', '--port', PORT], {
  env,
  stdio: 'inherit',
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { child.kill(); process.exit(0) })
}
child.on('exit', code => process.exit(code ?? 0))
