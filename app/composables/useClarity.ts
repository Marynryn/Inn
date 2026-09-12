/**
 * Тонкая обёртка над window.clarity: вызовы безопасны, когда скрипт не
 * подключён (локалка, тесты, блокировщик) — тогда просто ничего не происходит.
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
