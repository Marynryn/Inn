const LS_LAST = 'tavern:lastReadChapter'
const LS_LIST = 'tavern:readChapters'

/** Тот же префикс, которым useScrollProgress помечает свои ключи. */
const LS_SCROLL = 'tavern:scroll:'

type Chapter = { id: string; title: string }

/**
 * Закладка читателя. У гостя живёт в браузере, как и жила; у вошедшего — ещё и
 * на сервере, чтобы совпадала на телефоне и на ноутбуке.
 *
 * Браузер остаётся первым: он отвечает мгновенно и работает без сети. Сервер
 * подмешивается сверху, когда ответит, — состояние реактивное, страница
 * дорисуется сама.
 */
export const useReadProgress = () => {
  const auth = useAuthStore()
  const lastRead = useState<Chapter | null>('lastRead', () => null)
  const readChapters = useState<string[]>('readChapters', () => [])

  /** Места в главах, пришедшие с сервера: в этом браузере их может не быть вовсе. */
  const serverScroll = useState<Record<string, number>>('serverScroll', () => ({}))

  const push = (body: { chapterId: string; read?: boolean; scroll?: number }) => {
    if (!auth.isAuthed) return
    $fetch('/api/progress', { method: 'POST', body }).catch(() => {})
  }

  const load = () => {
    if (!import.meta.client) return
    try {
      const raw = localStorage.getItem(LS_LAST)
      lastRead.value = raw ? JSON.parse(raw) : null
      const rawList = localStorage.getItem(LS_LIST)
      readChapters.value = rawList ? JSON.parse(rawList) : []
    } catch {}
  }

  const setLastRead = (chapter: Chapter) => {
    lastRead.value = chapter
    try { localStorage.setItem(LS_LAST, JSON.stringify(chapter)) } catch {}
    push({ chapterId: chapter.id })
  }

  const markRead = (id: string) => {
    push({ chapterId: id, read: true })
    if (readChapters.value.includes(id)) return
    readChapters.value = [...readChapters.value, id]
    try { localStorage.setItem(LS_LIST, JSON.stringify(readChapters.value)) } catch {}
  }

  const isRead = (id: string) => readChapters.value.includes(id)

  /** Место в главе — только для вошедшего, и только под конец чтения. */
  const saveScroll = (chapterId: string, scroll: number) => {
    if (scroll > 0) push({ chapterId, scroll })
  }

  /** Всё, что накопилось в браузере, — чтобы сравнить с тем, что знает сервер. */
  const localPayload = () => {
    const scroll: Record<string, number> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(LS_SCROLL)) continue
      const value = parseFloat(localStorage.getItem(key) ?? '')
      if (value > 0) scroll[key.slice(LS_SCROLL.length)] = value
    }
    return { read: readChapters.value, scroll, lastReadId: lastRead.value?.id ?? null }
  }

  /**
   * Сводит закладку браузера с серверной. Сначала спрашиваем сервер, потом
   * досылаем то, чего у него нет.
   *
   * Раньше перенос делался один раз на браузер, под меткой, — и всё, что человек
   * читал разлогиненным после первого входа, до сервера уже не доезжало.
   * Сравнение вместо метки закрывает это: лишнего запроса не будет, если
   * досылать нечего, а дырки не останется, если есть.
   */
  const syncFromServer = async () => {
    if (!import.meta.client || !auth.isAuthed) return

    load()

    const server = await $fetch<{
      lastRead: Chapter | null
      read: string[]
      scroll: Record<string, number>
    }>('/api/progress').catch(() => null)

    if (!server) return

    const local = localPayload()
    const newRead = local.read.filter(id => !server.read.includes(id))
    const newScroll = Object.fromEntries(
      Object.entries(local.scroll).filter(([id, value]) => value > (server.scroll[id] ?? 0)),
    )

    if (newRead.length || Object.keys(newScroll).length) {
      const touched = new Set([...newRead, ...Object.keys(newScroll)])

      await $fetch('/api/progress/merge', {
        method: 'POST',
        body: {
          read: newRead,
          scroll: newScroll,
          // Закладку двигаем, только если она указывает на то, что мы как раз
          // досылаем: иначе местная, застоявшаяся, откатила бы серверную назад.
          lastReadId: local.lastReadId && touched.has(local.lastReadId) ? local.lastReadId : null,
        },
      }).catch(() => {})
    }

    readChapters.value = [...new Set([...readChapters.value, ...server.read])]
    if (server.lastRead && !newRead.length) lastRead.value = server.lastRead
    serverScroll.value = { ...server.scroll, ...newScroll }

    // Список прочитанного пригодится и до следующего ответа сервера.
    try { localStorage.setItem(LS_LIST, JSON.stringify(readChapters.value)) } catch {}
  }

  return {
    lastRead,
    readChapters,
    serverScroll,
    load,
    setLastRead,
    markRead,
    isRead,
    saveScroll,
    syncFromServer,
  }
}
