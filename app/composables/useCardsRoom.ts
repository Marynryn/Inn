import type { Action, CardsClientMessage, CardsRoomView, CardsServerMessage, HeroId } from '#shared/utils/cards'

/**
 * Связь страницы стола «Карт таверны» с сервером. Партия живёт на сервере и
 * после каждого хода приходит сюда — своим видом: игрок всегда снизу, чужие
 * карты скрыты. Страница только просит: выбрать отряд, сходить, реванш.
 *
 * Кто ты — как в настольной игре: вошедший садится сразу, гость — когда
 * назовётся (имя общее с настольной игрой). Связь рвётся — переподключаемся.
 */
const LS_GUEST_NAME = 'tavern:boardName'

export function useCardsRoom(code: string) {
  const room = ref<CardsRoomView | null>(null)
  const connected = ref(false)
  /** Не пустили за стол — дальше пробовать незачем. */
  const fatal = ref('')
  const notice = ref('')
  const needName = ref(false)
  const nameError = ref('')
  let guestName: string | null = null

  let ws: WebSocket | null = null
  let stopped = false
  let retry = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let noticeTimer: ReturnType<typeof setTimeout> | null = null

  function flash(text: string) {
    notice.value = text
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => { notice.value = '' }, 4000)
  }

  async function connect() {
    if (stopped || ws) return

    let ticket: string
    try {
      const auth = useAuthStore()
      if (!auth.ready) await auth.fetchMe()
      if (!auth.isAuthed && !guestName) {
        guestName = localStorage.getItem(LS_GUEST_NAME)
        if (!guestName) { needName.value = true; return }
      }
      const res = await $fetch<{ ticket: string }>('/api/board/ticket', {
        method: 'POST',
        body: { visitor: visitorId(), name: auth.isAuthed ? undefined : guestName },
      })
      ticket = res.ticket
      needName.value = false
      if (!auth.isAuthed && guestName) localStorage.setItem(LS_GUEST_NAME, guestName)
    } catch (e: any) {
      if (e?.statusCode === 409 || e?.statusCode === 400) {
        guestName = null
        try { localStorage.removeItem(LS_GUEST_NAME) } catch {}
        nameError.value = e?.data?.message || 'Это имя не подходит'
        needName.value = true
        return
      }
      retryTimer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 15000))
      return
    }
    if (stopped) return

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${proto}://${location.host}/_cards`)
    ws = socket

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'join', ticket, code } satisfies CardsClientMessage))
    }

    socket.onmessage = (e) => {
      let msg: CardsServerMessage
      try { msg = JSON.parse(e.data) }
      catch { return }

      if (msg.type === 'room') {
        connected.value = true
        retry = 0
        room.value = msg.room
      } else if (msg.type === 'error') {
        if (msg.fatal) {
          fatal.value = msg.message
          stopped = true
          socket.close()
        } else {
          flash(msg.message)
        }
      }
    }

    socket.onclose = () => {
      if (ws === socket) ws = null
      connected.value = false
      if (stopped) return
      const delay = Math.min(1000 * 2 ** retry, 15000)
      retry++
      retryTimer = setTimeout(connect, delay)
    }
  }

  function send(msg: CardsClientMessage) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    else flash('Нет связи с таверной, переподключаемся…')
  }

  function stop() {
    stopped = true
    if (retryTimer) clearTimeout(retryTimer)
    if (noticeTimer) clearTimeout(noticeTimer)
    try { ws?.close() } catch {}
    ws = null
  }

  function joinAs(name: string) {
    guestName = name.trim()
    nameError.value = ''
    if (guestName) connect()
  }

  onMounted(connect)
  onBeforeUnmount(stop)

  return {
    room,
    connected,
    fatal,
    notice,
    needName,
    nameError,
    joinAs,
    team: (team: HeroId[]) => send({ type: 'team', team }),
    act: (action: Action) => send({ type: 'act', action }),
    rematch: () => send({ type: 'rematch' }),
    leave: () => { send({ type: 'leave' }); stop() },
  }
}
