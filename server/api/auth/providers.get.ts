import { publicOrigin } from '../../utils/public-origin'
import { telegramLoginAvailable } from '../../utils/telegram'

/**
 * Какие способы входа доступны с этого адреса. Страница рисует только рабочие
 * кнопки: без ключей Google ведёт на ошибку, а телеграм пускает лишь с домена,
 * выданного боту.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const origin = publicOrigin(event)

  return {
    google: Boolean(config.oauth?.google?.clientId && config.oauth?.google?.clientSecret),
    telegram: await telegramLoginAvailable(origin),
  }
})
