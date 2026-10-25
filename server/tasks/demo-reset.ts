import { isDemo, resetDemo } from '../utils/demo/seed'

/**
 * Каждую ночь возвращает демо-стенд к исходному виду: посетители меняют там
 * что угодно, а утром покупатель должен увидеть чистую витрину. На боевом
 * сайте будильник тоже звонит, но задача сразу выходит.
 */
export default defineTask({
  meta: {
    name: 'demo-reset',
    description: 'Сбрасывает демо-стенд к исходному виду',
  },
  async run() {
    if (!isDemo()) return { result: 'not-demo' }
    try {
      await resetDemo()
      return { result: 'reset' }
    } catch (e: any) {
      console.error(`[demo] сброс не удался: ${e?.message ?? e}`)
      return { result: { error: String(e?.message ?? e) } }
    }
  },
})
