import { finishTelegramLogin } from '../../../utils/telegram-login'

/** Возврат от телеграма для входа, начатого на этом же домене. */
export default defineEventHandler(event => finishTelegramLogin(event, null))
