/*
  Заслон от внешнего мира для тестового режима. Оборачивает fetch так, что
  наружу (не на localhost) не уходит ни один запрос — ни в телеграм, ни в
  Google, никуда. Отдельной функцией, а не внутри плагина, чтобы её можно было
  проверить тестом без поднятого сервера.
*/
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export const isLocalHost = (host: string) => LOCAL_HOSTS.has(host)

export function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

export function blockExternalFetch(realFetch: typeof fetch, onBlock?: (url: string) => void): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input)
    let host = ''
    try { host = new URL(url, 'http://localhost').hostname } catch {}
    if (!isLocalHost(host)) {
      onBlock?.(url)
      return Promise.reject(new Error(`E2E_OFFLINE: запрос к «${host || url}» запрещён в тестовом режиме`))
    }
    return realFetch(input, init)
  }) as typeof fetch
}
