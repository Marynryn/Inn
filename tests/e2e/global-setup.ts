import type { FullConfig } from '@playwright/test'
import { seed } from './seed.ts'

/** Сервер уже поднят Playwright'ом — остаётся заселить его. */
export default async function globalSetup(config: FullConfig) {
  await seed(config.projects[0]!.use.baseURL!)
}
