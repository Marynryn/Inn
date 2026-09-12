/*
  Стенд для исследователя без тестового раннера: поднимает сайт на пустой базе
  (тот же serve.mjs, что и у e2e), ждёт его, заселяет и остаётся жить, пока
  его не остановят. Нужен, когда сайт исследует Claude Code через Playwright
  MCP — там Playwright-тест не запускается, а сервер и посев нужны те же.

  Запуск:  node tests/explorer/stand.mjs        (Ctrl+C — остановить)
*/
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { seed, waitForServer } from '../e2e/seed.ts'

const PORT = process.env.E2E_PORT || '3100'
const URL = `http://localhost:${PORT}`
const here = dirname(fileURLToPath(import.meta.url))

const server = spawn(process.execPath, [resolve(here, '../e2e/serve.mjs')], {
  env: { ...process.env, E2E_PORT: PORT },
  stdio: ['ignore', 'ignore', 'inherit'],
})
server.on('exit', code => { console.error(`[stand] сервер завершился с кодом ${code}`); process.exit(code ?? 1) })
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.kill(); process.exit(0) })

console.log(`[stand] поднимаю сайт на ${URL}…`)
await waitForServer(URL)
await seed(URL)
console.log(`[stand] готово: ${URL} — пустая база, admin@tavern.local, reader@test.local, second@test.local, три главы`)
console.log('[stand] стенд живёт, пока его не остановят')
