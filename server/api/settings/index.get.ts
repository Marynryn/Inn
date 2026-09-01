import { useDb } from '../../utils/db'
import { siteSettings } from '../../database/schema'
import { dailyMaxVolume } from '../../utils/game-session'

export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db.select().from(siteSettings)

  return {
    ...Object.fromEntries(rows.map(r => [r.key, r.value])),
    // Настройка может быть пустой («по переводу»), а плашке на главной нужно
    // конкретное число — считаем его здесь, а не в браузере.
    game_volume_effective: String(await dailyMaxVolume()),
  }
})
