import { boardVisitDays } from '../../database/schema'
import { useDb } from '../../utils/db'
import { mskDay } from '../../utils/msk'
import { readVisitor, visitorPrint } from '../../utils/visitor'

/**
 * Заход на страницы настольной игры — для счётчика «разных людей за день».
 * Зовёт уже загруженная страница; админы и боты не в счёт. В базу ложится
 * только отпечаток кода браузера с датой, как у читателей глав.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user?.role === 'admin' || isBotRequest(event)) return { counted: false }

  const visitor = await readVisitor(event)
  if (!visitor) return { counted: false }

  const day = mskDay()
  await useDb().insert(boardVisitDays).values({ day, visitor: visitorPrint(visitor, `board:${day}`) }).onConflictDoNothing()
  return { counted: true }
})
