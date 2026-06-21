const LS_LAST = 'tavern:lastReadChapter'
const LS_LIST = 'tavern:readChapters'

export const useReadProgress = () => {
  const lastRead = useState<{ id: string; title: string } | null>('lastRead', () => null)
  const readChapters = useState<string[]>('readChapters', () => [])

  const load = () => {
    if(!import.meta.client){return}
    try {
      const raw = localStorage.getItem(LS_LAST)
      lastRead.value = raw ? JSON.parse(raw) : null
      const rawList = localStorage.getItem(LS_LIST)
      readChapters.value = rawList ? JSON.parse(rawList) : []
    } catch {}
  }

  const setLastRead = (chapter: { id: string; title: string }) => {
    lastRead.value = chapter
    try { localStorage.setItem(LS_LAST, JSON.stringify(chapter)) } catch {}
  }

  const markRead = (id: string) => {
    if(readChapters.value.includes(id)){return}
    readChapters.value = [...readChapters.value, id]
    try { localStorage.setItem(LS_LIST, JSON.stringify(readChapters.value)) } catch {}
  }

  const isRead = (id: string) => readChapters.value.includes(id)

  return { lastRead, readChapters, load, setLastRead, markRead, isRead }
}
