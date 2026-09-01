import { currentSession, dailyMaxVolume, playerKey, revealAnswer, sessionState } from '../../utils/game-session'

/** Сдаться: партия закрывается, и только теперь сервер называет загаданного. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ mode?: string }>(event)
  const daily = body?.mode !== 'endless'

  const player = playerKey(event)
  const row = await currentSession(
    player,
    daily ? 'daily' : 'endless',
    'known',
    daily ? await dailyMaxVolume() : undefined,
  )

  return sessionState(await revealAnswer(row))
})
