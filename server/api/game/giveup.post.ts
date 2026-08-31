import { currentSession, playerKey, revealAnswer, sessionState } from '../../utils/game-session'

/** Сдаться: партия закрывается, и только теперь сервер называет загаданного. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ mode?: string }>(event)

  const player = playerKey(event)
  const row = await currentSession(player, body?.mode === 'endless' ? 'endless' : 'daily', 'known')

  return sessionState(await revealAnswer(row))
})
