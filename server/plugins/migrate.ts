import { runMigrations } from '../utils/migrate'
import { isDemo, seedDemo } from '../utils/demo/seed'

export default defineNitroPlugin(async () => {
  await runMigrations()
  // Демо-стенд при первом запуске наполняется выдуманной книгой. На боевом
  // сайте isDemo() ложно, и сюда не заходим.
  if (isDemo()) await seedDemo()
})
