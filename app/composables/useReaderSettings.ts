import {
  DEFAULT_READER_SETTINGS,
  normalizeReaderSettings,
  type ReaderSettings,
} from '#shared/utils/readerSettings'

/** Ключ в браузере. Тот же читает встроенный скрипт в шапке главы — см. LS_READER там. */
export const LS_READER = 'tavern:reader'

/**
 * Вид страницы главы: тема, кегль, высота строки, ширина колонки.
 *
 * Браузер — первый: он отвечает мгновенно, а встроенный скрипт в шапке главы
 * успевает применить его ещё до первой отрисовки, без мигания. У вошедшего
 * сверху ложится сервер — чтобы телефон и ноутбук выглядели одинаково; что
 * пришло с сервера, тоже кладём в браузер, и в следующий раз мигания не будет.
 *
 * Применяется через переменные на <html>: страница главы читает их в стилях,
 * остальные страницы их не знают. Так тема не перебивает цвет и кегль, заданные
 * в самом тексте главы, — inline-стиль сильнее унаследованного.
 */
export const useReaderSettings = () => {
  const auth = useAuthStore()
  const settings = useState<ReaderSettings>('readerSettings', () => ({ ...DEFAULT_READER_SETTINGS }))

  /** Человек уже крутил настройки в этой сессии: ответ сервера их не перебивает. */
  const touched = useState('readerSettingsTouched', () => false)

  const apply = (s: ReaderSettings) => {
    if (!import.meta.client) return
    const root = document.documentElement
    root.setAttribute('data-reader-theme', s.theme)
    root.style.setProperty('--reader-font', `${s.fontSize}pt`)
    root.style.setProperty('--reader-lh', String(s.lineHeight))
    root.style.setProperty('--reader-width', String(s.width))
  }

  const readLocal = (): ReaderSettings | null => {
    try {
      const raw = localStorage.getItem(LS_READER)
      return raw ? normalizeReaderSettings(JSON.parse(raw)) : null
    }
    catch {
      return null
    }
  }

  const writeLocal = (s: ReaderSettings) => {
    try { localStorage.setItem(LS_READER, JSON.stringify(s)) }
    catch {}
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  /** На сервер — с задержкой: ползунок шлёт десятки значений в секунду. */
  const pushLater = (s: ReaderSettings) => {
    if (!auth.isAuthed) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      $fetch('/api/profile/reader', { method: 'PUT', body: s }).catch(() => {})
    }, 500)
  }

  const set = (patch: Partial<ReaderSettings>) => {
    const next = normalizeReaderSettings({ ...settings.value, ...patch })
    settings.value = next
    touched.value = true
    apply(next)
    writeLocal(next)
    pushLater(next)
  }

  const reset = () => set({ ...DEFAULT_READER_SETTINGS })

  /** Подхватить сохранённое: сразу из браузера, у вошедшего — потом и с сервера. */
  const load = () => {
    if (!import.meta.client) return

    const local = readLocal()
    if (local) {
      settings.value = local
      apply(local)
    }

    const pullFromServer = async () => {
      let fromServer: ReaderSettings | null = null
      try {
        fromServer = (await $fetch<{ settings: ReaderSettings | null }>('/api/profile/reader')).settings
      }
      catch {
        return
      }

      if (touched.value) return

      if (fromServer) {
        settings.value = fromServer
        apply(fromServer)
        writeLocal(fromServer)
      }
      else if (local) {
        // На сервере пусто, а в браузере настроено ещё гостем — забираем с собой.
        pushLater(local)
      }
    }

    // Уже крутил в этой сессии — состояние и так верное, сервер не спрашиваем.
    if (touched.value) return

    // Кто вошёл, узнаётся не сразу — плагин спрашивает сервер после гидрации.
    // Ждём ответа, а не проверяем один раз.
    if (auth.isAuthed) pullFromServer()
    else {
      const stop = watch(() => auth.isAuthed, (authed) => {
        if (!authed) return
        stop()
        pullFromServer()
      })
    }
  }

  return { settings, set, reset, load }
}
