import type { BoardChatMessage, BoardClientMessage, BoardServerMessage, BoardSkill, BoardState } from '#shared/utils/board'

/**
 * Связь страницы комнаты с сервером. Состояние партии целиком живёт на
 * сервере и приходит сюда после каждого хода; страница только просит —
 * начать, бросить, написать в чат.
 *
 * Связь рвётся — переподключаемся сами: место за столом за человеком
 * сохраняется, и после переподключения он видит партию с того же места.
 *
 * Вошедший садится за стол сразу. Гость — когда назовётся: имя запоминаем в
 * браузере, и в следующий раз он садится без вопросов.
 */
const LS_GUEST_NAME = 'tavern:boardName'

export function useBoardRoom(code: string) {
  const state = ref<BoardState | null>(null)
  const chat = ref<BoardChatMessage[]>([])
  const you = ref<number | null>(null)
  const connected = ref(false)
  /** Не пустили в комнату — дальше пробовать незачем. */
  const fatal = ref('')
  const notice = ref('')
  /** Гостю надо назваться, прежде чем сесть за стол. */
  const needName = ref(false)
  /** Почему имя не подошло — показать у поля. */
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
      // Имя не подошло — спрашиваем снова; иное — сеть, пробуем позже.
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
    const socket = new WebSocket(`${proto}://${location.host}/_board`)
    ws = socket

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'join', ticket, code } satisfies BoardClientMessage))
    }

    socket.onmessage = (e) => {
      let msg: BoardServerMessage
      try { msg = JSON.parse(e.data) }
      catch { return }

      if (msg.type === 'joined') {
        connected.value = true
        retry = 0
        you.value = msg.you
        state.value = msg.state
        chat.value = msg.chat
      } else if (msg.type === 'state') {
        state.value = msg.state
      } else if (msg.type === 'event') {
        flash(msg.text)
      } else if (msg.type === 'chat') {
        chat.value = [...chat.value, msg.message].slice(-100)
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
      // Пауза растёт, чтобы упавший сервер не забрасывали попытками.
      const delay = Math.min(1000 * 2 ** retry, 15000)
      retry++
      retryTimer = setTimeout(connect, delay)
    }
  }

  function send(msg: BoardClientMessage) {
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

  /** Гость назвался — садимся за стол. */
  function joinAs(name: string) {
    guestName = name.trim()
    nameError.value = ''
    if (guestName) connect()
  }

  onMounted(connect)
  onBeforeUnmount(stop)

  return {
    state,
    chat,
    you,
    connected,
    fatal,
    notice,
    needName,
    nameError,
    joinAs,
    start: () => send({ type: 'start' }),
    rematch: () => send({ type: 'rematch' }),
    roll: () => send({ type: 'roll' }),
    useSkill: (skill: BoardSkill, target?: number) => send({ type: 'skill', skill, target }),
    choose: (index: number) => send({ type: 'choose', index }),
    say: (text: string) => send({ type: 'chat', text }),
    leave: () => { send({ type: 'leave' }); stop() },
  }
}
