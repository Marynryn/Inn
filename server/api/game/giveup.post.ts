import { currentSession, dailyMaxVolume, playerIdentity, revealAnswer, sessionState } from '../../utils/game-session'

/** Сдаться: партия закрывается, и только теперь сервер называет загаданного. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ mode?: string }>(event)
  const daily = body?.mode !== 'endless'

  const { player, userId, isAdmin } = await playerIdentity(event)
  const row = await currentSession(
    player,
    daily ? 'daily' : 'endless',
    'known',
    daily ? await dailyMaxVolume() : undefined,
    isAdmin,
    userId,
  )

  return sessionState(await revealAnswer(row))
})
