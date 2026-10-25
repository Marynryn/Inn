import type { BoardChatMessage, BoardClientMessage, BoardServerMessage, BoardSkill, BoardState } from '#shared/utils/board'

/**
 * Связь страницы комнаты с сервером. Состояние партии целиком живёт на
 * сервере и приходит сюда после каждого хода; страница только просит —
 * начать, бросить, написать в чат.
 *
 * Связь рвётся — переподключаемся сами: место за столом за человеком
 * сохраняется, и после переподключения он видит партию с того же места.
 */
export function useBoardRoom(code: string) {
  const state = ref<BoardState | null>(null)
  const chat = ref<BoardChatMessage[]>([])
  const you = ref<number | null>(null)
  const connected = ref(false)
  /** Не пустили в комнату — дальше пробовать незачем. */
  const fatal = ref('')
  const notice = ref('')

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
      ticket = (await $fetch<{ ticket: string }>('/api/notifications/ws-ticket')).ticket
    } catch {
      fatal.value = 'Чтобы играть, нужно войти'
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

  onMounted(connect)
  onBeforeUnmount(stop)

  return {
    state,
    chat,
    you,
    connected,
    fatal,
    notice,
    start: () => send({ type: 'start' }),
    rematch: () => send({ type: 'rematch' }),
    roll: () => send({ type: 'roll' }),
    useSkill: (skill: BoardSkill, target?: number) => send({ type: 'skill', skill, target }),
    say: (text: string) => send({ type: 'chat', text }),
    leave: () => { send({ type: 'leave' }); stop() },
  }
}
