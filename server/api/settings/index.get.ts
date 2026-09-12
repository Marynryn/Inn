import { useDb } from '../../utils/db'
import { siteSettings } from '../../database/schema'
import { dailyMaxVolume } from '../../utils/game-session'
import { ORIGINAL_AUTO_KEY, ORIGINAL_MANUAL_KEY } from '../../utils/original-toc'

export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db.select().from(siteSettings)
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]))

  return {
    ...settings,
    // Настройка может быть пустой («по переводу»), а плашке на главной нужно
    // конкретное число — считаем его здесь, а не в браузере.
    game_volume_effective: String(await dailyMaxVolume()),
    // Число глав оригинала: руками заданное перекрывает то, что узнали сами.
    // Пусто — ни того, ни другого ещё нет, и трекер карточку не показывает.
    original_chapters_effective: settings[ORIGINAL_MANUAL_KEY] || settings[ORIGINAL_AUTO_KEY] || '',
  }
})
