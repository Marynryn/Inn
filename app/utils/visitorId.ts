const LS_VISITOR = 'tavern:visitor'

/**
 * Случайный код этого браузера — для счётчика «разных читателей за день».
 * Ни с аккаунтом, ни с адресом он не связан, на сервер уходит только вместе
 * с просмотром главы, а в базу ложится лишь его отпечаток с датой.
 *
 * Хранилище недоступно (приватное окно, запрет сайтам) — кода нет, и такой
 * просмотр в «разных читателях» не учитывается: лучше недосчитать, чем
 * насчитать нового человека на каждой главе.
 */
export function visitorId(): string | null {
  try {
    let id = localStorage.getItem(LS_VISITOR)
    if (!id) {
      id = typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')
      localStorage.setItem(LS_VISITOR, id)
    }
    return id
  }
  catch {
    return null
  }
}
