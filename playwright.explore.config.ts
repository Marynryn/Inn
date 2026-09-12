import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/*
  Конфиг исследователя: тот же сервер и посев, что у e2e, но один долгий
  «тест» с агентом вместо набора сценариев. Запуск: npm run test:explore
*/
export default defineConfig({
  ...base,
  testDir: 'tests/explorer',
  timeout: 45 * 60_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.data/explorer-report-html' }]],
  outputDir: '.data/explorer-results',
  projects: [{ name: 'explorer', use: { ...base.use } }],
})
