import { reelGuestTries } from '../../database/schema'
import { useDb } from '../../utils/db'
import { runningReelFor } from '../../utils/reel'

/**
 * Гость открыл барабан и увидел «войти» вместо кнопки: хотел покрутить, но
 * не мог. Один браузер считается на барабан один раз — по отпечатку кода из
 * localStorage, сам код не хранится.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user || isBotRequest(event)) return { ok: true, counted: false }

  const visitor = await readVisitor(event)
  const reel = await runningReelFor(undefined)
  if (!visitor || !reel) return { ok: true, counted: false }

  await useDb()
    .insert(reelGuestTries)
    .values({ reelId: reel.id, visitor: visitorPrint(visitor, `reel:${reel.id}`) })
    .onConflictDoNothing()
  return { ok: true, counted: true }
})
