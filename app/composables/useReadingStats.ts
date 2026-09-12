/**
 * Трекер прогресса: сколько перевода прочитано и сколько осталось — в главах,
 * словах и часах. Считает от позиции читателя, которую по умолчанию берёт из
 * закладки; страница /progress подставляет вместо неё любую главу, чтобы
 * прикинуть, — закладку это не двигает.
 *
 * «Всего» здесь — сколько переведено, а не все пятнадцать миллионов слов
 * оригинала: цель читателя на этом сайте — догнать перевод.
 */

export type Speed = 'slow' | 'avg' | 'fast'

/** Слов в минуту. Русский текст читается медленнее английского — цифры под него. */
export const SPEED_WPM: Record<Speed, number> = { slow: 120, avg: 180, fast: 250 }
export const SPEED_LABEL: Record<Speed, string> = { slow: 'Неспешно', avg: 'Обычно', fast: 'Быстро' }

/** Слов на «страницу» — для наглядности рядом с большими числами. */
const WORDS_PER_PAGE = 250

const LS_KEY = 'tavern:tracker'
const LS_SCROLL = 'tavern:scroll:'

type Chapter = { id: string; title: string; volume: number; sortOrder?: number; wordCount?: number; isPublished?: boolean }

/** Где читатель: глава и доля, на которую она прочитана (0..1). */
export type Position = { id: string; fraction: number } | null

export type Stats = {
  chaptersTotal: number
  chaptersRead: number
  chaptersLeft: number
  wordsTotal: number
  wordsRead: number
  wordsLeft: number
  /** По словам — точнее, чем по главам: главы очень разной длины. */
  percent: number
  pagesRead: number
  pagesLeft: number
  hoursRead: number
  hoursTotal: number
  hoursLeft: number
  /** Когда догоните перевод при нынешнем темпе; null — уже догнали. */
  finishAt: Date | null
  /** Догнал перевод: последняя глава дочитана. */
  done: boolean
}

export const useReadingStats = (chapters: Ref<Chapter[] | null>) => {
  const { lastRead, isRead, serverScroll } = useReadProgress()

  const speed = useState<Speed>('tracker:speed', () => 'avg')
  const hoursPerDay = useState<number>('tracker:hoursPerDay', () => 1)

  const loadSettings = () => {
    if (!import.meta.client) return
    try {
      const raw = localStorage.getItem(LS_KEY)
      const saved = raw ? JSON.parse(raw) : null
      if (typeof saved?.speed === 'string' && saved.speed in SPEED_WPM) speed.value = saved.speed
      if (typeof saved?.hoursPerDay === 'number' && saved.hoursPerDay > 0) hoursPerDay.value = saved.hoursPerDay
    } catch {}
  }

  const saveSettings = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ speed: speed.value, hoursPerDay: hoursPerDay.value }))
    } catch {}
  }

  const sorted = computed(() =>
    // Черновики видит только админ — в его прогрессе им тоже делать нечего.
    (chapters.value ?? []).filter(c => c.isPublished !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  )

  /** Доля прокрутки главы: что помнит этот браузер или сервер — что больше. */
  const scrollOf = (id: string) => {
    let local = 0
    if (import.meta.client) {
      try { local = parseFloat(localStorage.getItem(LS_SCROLL + id) ?? '') || 0 } catch {}
    }
    return Math.min(1, Math.max(local, serverScroll.value[id] ?? 0))
  }

  /** Позиция по закладке: дочитанная глава — целиком, открытая — докуда докрутили. */
  const bookmark = computed<Position>(() => {
    const id = lastRead.value?.id
    if (!id || !sorted.value.some(c => c.id === id)) return null
    return { id, fraction: isRead(id) ? 1 : scrollOf(id) }
  })

  const statsFor = (position: Position): Stats => {
    const list = sorted.value
    const wpm = SPEED_WPM[speed.value]
    const wordsTotal = list.reduce((sum, c) => sum + (c.wordCount ?? 0), 0)

    let wordsRead = 0
    let chaptersRead = 0
    if (position) {
      const idx = list.findIndex(c => c.id === position.id)
      for (let i = 0; i < idx; i++) wordsRead += list[i]!.wordCount ?? 0
      chaptersRead = idx
      if (idx >= 0) {
        if (position.fraction >= 1) chaptersRead++
        wordsRead += (list[idx]!.wordCount ?? 0) * position.fraction
      }
    }
    wordsRead = Math.round(wordsRead)

    const wordsLeft = Math.max(0, wordsTotal - wordsRead)
    const hoursRead = wordsRead / wpm / 60
    const hoursTotal = wordsTotal / wpm / 60
    const hoursLeft = wordsLeft / wpm / 60
    const done = list.length > 0 && chaptersRead >= list.length

    let finishAt: Date | null = null
    if (!done && hoursPerDay.value > 0) {
      finishAt = new Date()
      finishAt.setDate(finishAt.getDate() + Math.ceil(hoursLeft / hoursPerDay.value))
    }

    return {
      chaptersTotal: list.length,
      chaptersRead,
      chaptersLeft: list.length - chaptersRead,
      wordsTotal,
      wordsRead,
      wordsLeft,
      percent: wordsTotal ? Math.min(100, (wordsRead / wordsTotal) * 100) : 0,
      pagesRead: Math.round(wordsRead / WORDS_PER_PAGE),
      pagesLeft: Math.round(wordsLeft / WORDS_PER_PAGE),
      hoursRead,
      hoursTotal,
      hoursLeft,
      finishAt,
      done,
    }
  }

  const bookmarkStats = computed(() => statsFor(bookmark.value))

  return { speed, hoursPerDay, loadSettings, saveSettings, sorted, bookmark, statsFor, bookmarkStats }
}

export const formatNumber = (n: number) => Math.round(n).toLocaleString('ru-RU')

/** «~40 ч» для больших сроков, «1 ч 30 мин» для коротких, «20 мин» для совсем коротких. */
export const formatHours = (hours: number) => {
  const minutes = Math.round(hours * 60)
  if (minutes < 60) return `${minutes} мин`
  if (hours < 10) {
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    return m ? `${h} ч ${m} мин` : `${h} ч`
  }
  return `~${formatNumber(hours)} ч`
}

export const formatDate = (date: Date) => {
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** Подбадривающая фраза по доле прочитанного. */
export const encouragement = (stats: Stats) => {
  if (stats.done) return 'Вы догнали перевод. Дальше — вместе с нами, глава за главой.'
  const p = stats.percent
  if (p <= 0) return 'Всё впереди. Дверь таверны открыта.'
  if (p < 10) return 'Первые шаги. В таверне уже знают ваше имя.'
  if (p < 25) return 'Вы здесь свой. Самое интересное впереди.'
  if (p < 50) return 'Четверть позади — история только разгоняется.'
  if (p < 75) return 'Больше половины. Обратной дороги нет.'
  if (p < 95) return 'Финишная прямая: последняя переведённая глава уже видна.'
  return 'Ещё чуть-чуть — и вы будете ждать новых глав вместе со всеми.'
}
