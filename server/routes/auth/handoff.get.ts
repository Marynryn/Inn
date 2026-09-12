import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'
import { sendBrowserRedirect } from '../../utils/browser-redirect'
import { useDb } from '../../utils/db'
import { takeTicket } from '../../utils/handoff'
import { afterLogin, toSessionUser } from '../../utils/identity'

/**
 * Вторая половина входа на зеркале: основной домен завершил разговор с Google
 * и отправил браузер сюда с билетом (см. utils/handoff.ts). Билет превращается
 * в сессию на этом домене, дальше — куда человек и шёл.
 */
export default defineEventHandler(async (event) => {
  const handoff = takeTicket(getQuery(event).t)
  if (!handoff) {
    console.error('[auth] handoff: билет не принят')
    return sendBrowserRedirect(event, '/login?error=google&reason=handoff')
  }

  const [user] = await useDb().select().from(users).where(eq(users.id, handoff.userId))
  if (!user || user.isBanned) {
    return sendBrowserRedirect(event, '/login?error=google&reason=handoff-user')
  }

  await setUserSession(event, { user: await toSessionUser(user) })
  return sendBrowserRedirect(event, afterLogin(event, handoff.created))
})
