/**
 * Тонкая обёртка над window.clarity: вызовы безопасны, когда скрипт не
 * подключён (локалка, тесты, блокировщик) — тогда просто ничего не происходит.
 * Очередь window.clarity ставит плагин clarity.client.ts сразу при старте,
 * так что вызовы до загрузки тега не теряются, а дожидаются его.
 *
 *   useClarity().event('ticker_click')   — пометить сессию событием,
 *   useClarity().set('authed', 'yes')    — навесить тег для фильтров.
 */
type ClarityFn = (...args: unknown[]) => void

export function useClarity() {
  const call: ClarityFn = (...args) => {
    if (!import.meta.client) return
    const clarity = (window as unknown as { clarity?: ClarityFn }).clarity
    clarity?.(...args)
  }
  return {
    event: (name: string) => call('event', name),
    set: (key: string, value: string) => call('set', key, value),
  }
}
