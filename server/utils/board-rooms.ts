import { randomInt } from 'node:crypto'
import type {
  BoardAction,
  BoardChatMessage,
  BoardFx,
  BoardLogEntry,
  BoardPlayer,
  BoardServerMessage,
  BoardState,
  BoardStatus,
} from '#shared/utils/board'
import {
  BOARD_CELLS,
  BOARD_HAND_MAX,
  BOARD_SKILLS,
  BRAWL_THROW,
  DUEL_THROW,
  SKINNER_STEP_MAX,
  SKINNER_STEP_MIN,
  SKINNER_START,
  SKINNER_THROW,
  SKINNER_WAKES_AT,
  BOARD_CHAT_MAX,
  BOARD_CODE_ALPHABET,
  BOARD_CODE_LENGTH,
  BOARD_COLORS,
  BOARD_LAST,
  BOARD_MAX_PLAYERS,
  BOARD_MIN_PLAYERS,
  effectLabel,
  isBoardSkill,
  jumpTarget,
} from '#shared/utils/board'

/**
 * Комнаты настольной игры живут в памяти сервера, а не в базе: партия идёт
 * минуты, а сервер у сайта один. Перезапуск сервера партии обрывает — для
 * пробы это честная цена; если игра приживётся, состояние переедет в базу.
 */

type Seat = BoardPlayer & { userId: number }

type Room = {
  code: string
  status: BoardStatus
  hostUserId: number
  seats: Seat[]
  turn: number
  winnerSlot: number | null
  /** Где Скиннер. null — ещё не вышел из руин. */
  skinner: number | null
  lastAction: BoardAction | null
  /** Навык уже сыгран в этот ход — второй нельзя. */
  skillUsed: boolean
  log: BoardLogEntry[]
  chat: BoardChatMessage[]
  peers: Map<any, number>
  /** Когда ход перешёл к нынешнему игроку — для автоброска за ушедшего. */
  turnSince: number
  /** Когда в комнате последний раз кто-то был — пустые подчищаются. */
  touchedAt: number
  seq: number
}

export type BoardUser = { id: number; name: string; avatarUrl: string | null }

const rooms = new Map<string, Room>()
/** Последнее сообщение в чат по читателю — чтобы не заливали. */
const lastChatAt = new Map<number, number>()

const LOG_MAX = 30
const CHAT_KEEP = 100
const CHAT_GAP_MS = 700
/** Сколько ждать игрока без связи, прежде чем бросить кубик за него. */
const OFFLINE_TURN_MS = 30_000
/** Пустая комната живёт полчаса: вдруг все просто перезагрузили страницу. */
const EMPTY_ROOM_MS = 30 * 60_000

function newCode(): string {
  for (;;) {
    let code = ''
    for (let i = 0; i < BOARD_CODE_LENGTH; i++) code += BOARD_CODE_ALPHABET[randomInt(BOARD_CODE_ALPHABET.length)]
    if (!rooms.has(code)) return code
  }
}

const isOnline = (room: Room, userId: number) => [...room.peers.values()].includes(userId)

function stateOf(room: Room): BoardState {
  const host = room.seats.find(s => s.userId === room.hostUserId)
  return {
    code: room.code,
    status: room.status,
    hostSlot: host?.slot ?? -1,
    turnSlot: room.status === 'playing' ? room.seats[room.turn]?.slot ?? null : null,
    winnerSlot: room.winnerSlot,
    players: room.seats.map(({ userId, ...p }) => ({ ...p, online: isOnline(room, userId) })),
    skinner: room.skinner,
    skillUsed: room.skillUsed,
    lastAction: room.lastAction,
    log: room.log,
  }
}

function send(peer: any, msg: BoardServerMessage) {
  try { peer.send(JSON.stringify(msg)) } catch {}
}

function broadcast(room: Room, msg: BoardServerMessage) {
  const text = JSON.stringify(msg)
  for (const peer of room.peers.keys()) {
    try { peer.send(text) } catch { room.peers.delete(peer) }
  }
}

const pushState = (room: Room) => broadcast(room, { type: 'state', state: stateOf(room) })

function log(room: Room, text: string) {
  room.log.push({ id: ++room.seq, text })
  if (room.log.length > LOG_MAX) room.log.splice(0, room.log.length - LOG_MAX)
}

export function createRoom(host: BoardUser): string {
  const code = newCode()
  rooms.set(code, {
    code,
    status: 'lobby',
    hostUserId: host.id,
    seats: [],
    turn: 0,
    winnerSlot: null,
    skinner: null,
    lastAction: null,
    skillUsed: false,
    log: [],
    chat: [],
    peers: new Map(),
    turnSince: Date.now(),
    touchedAt: Date.now(),
    seq: 0,
  })
  return code
}

/** Открытые комнаты — те, что ещё набирают игроков. */
export function openRooms() {
  return [...rooms.values()]
    .filter(r => r.status === 'lobby' && r.seats.length > 0 && r.seats.length < BOARD_MAX_PLAYERS)
    .map(r => ({
      code: r.code,
      host: r.seats.find(s => s.userId === r.hostUserId)?.name ?? null,
      players: r.seats.length,
      max: BOARD_MAX_PLAYERS,
    }))
}

/** Комната, где этот читатель сидит в незаконченной партии, — чтобы вернуть его. */
export function roomOfUser(userId: number): string | null {
  for (const r of rooms.values()) {
    if (r.status !== 'finished' && r.seats.some(s => s.userId === userId && !s.left)) return r.code
  }
  return null
}

export function joinRoom(code: string, user: BoardUser, peer: any): string | null {
  const room = rooms.get(code)
  if (!room) return 'Такой комнаты нет — может, партия уже закончилась'
  // Одно соединение — одна комната: второе приглашение на том же сокете не в счёт.
  if (peerSeat(peer)) return null

  let seat = room.seats.find(s => s.userId === user.id)
  if (!seat) {
    if (room.status !== 'lobby') return 'Партия уже идёт, новых игроков не берут'
    if (room.seats.length >= BOARD_MAX_PLAYERS) return 'За столом нет мест'
    const used = new Set(room.seats.map(s => s.slot))
    const slot = [0, 1, 2, 3].find(n => !used.has(n))!
    seat = {
      userId: user.id,
      slot,
      name: user.name,
      avatarUrl: user.avatarUrl,
      color: BOARD_COLORS[slot]!,
      pos: 0,
      skip: 0,
      skills: [],
      doubleNext: false,
      online: true,
      left: false,
    }
    room.seats.push(seat)
    log(room, `${user.name} садится за стол`)
  } else {
    // Имя и аватарка могли смениться, пока человек был вне комнаты.
    seat.name = user.name
    seat.avatarUrl = user.avatarUrl
    if (seat.left && room.status !== 'finished') {
      seat.left = false
      log(room, `${user.name} возвращается за стол`)
    }
  }

  room.peers.set(peer, user.id)
  room.touchedAt = Date.now()
  send(peer, { type: 'joined', you: seat.slot, state: stateOf(room), chat: room.chat })
  pushState(room)
  return null
}

type Peer = { room: Room; seat: Seat }

function peerSeat(peer: any): Peer | null {
  for (const room of rooms.values()) {
    const userId = room.peers.get(peer)
    if (userId === undefined) continue
    const seat = room.seats.find(s => s.userId === userId)
    return seat ? { room, seat } : null
  }
  return null
}

const fail = (peer: any, message: string) => send(peer, { type: 'error', message })

export function startGame(peer: any) {
  const p = peerSeat(peer)
  if (!p) return
  const { room, seat } = p
  if (room.status !== 'lobby') return
  if (seat.userId !== room.hostUserId) return fail(peer, 'Начать партию может только тот, кто создал комнату')
  if (room.seats.length < BOARD_MIN_PLAYERS) return fail(peer, 'Мало игроков')

  room.status = 'playing'
  room.turn = 0
  room.turnSince = Date.now()
  log(room, `Партия началась. Первым ходит ${room.seats[0]!.name}`)
  pushState(room)
}

/** Передать ход следующему, пропуская ушедших и тех, кто пропускает ход.
 *  Круг замкнулся — Скиннер делает свой ход; его шаги дописываются в fx
 *  того действия, после которого круг кончился. */
function nextTurn(room: Room, fx: BoardFx[] = [], notes: string[] = []) {
  const n = room.seats.length
  for (let tries = 0; tries < n * 4; tries++) {
    const prev = room.turn
    room.turn = (room.turn + 1) % n
    if (room.turn <= prev) moveSkinner(room, fx, notes)
    const seat = room.seats[room.turn]!
    if (seat.left) continue
    if (seat.skip > 0) {
      seat.skip--
      notes.push(`${seat.name} пропускает ход`)
      continue
    }
    break
  }
  room.skillUsed = false
  room.turnSince = Date.now()
}

const activeSeats = (room: Room) => room.seats.filter(s => !s.left)

/** Забрать [Чутьё опасности], если оно есть: оно гасит одну беду. */
function useShield(seat: Seat): boolean {
  const at = seat.skills.indexOf('danger')
  if (at < 0) return false
  seat.skills.splice(at, 1)
  return true
}

/** Отбросить игрока назад — если его не спасёт [Чутьё опасности]. */
function throwBack(seat: Seat, by: number, why: string, fx: BoardFx[], notes: string[]) {
  if (useShield(seat)) {
    notes.push(`${seat.name}: ${why}, но ${BOARD_SKILLS.danger.name} спасает`)
    return
  }
  seat.pos = Math.max(0, seat.pos - by)
  fx.push({ kind: 'push', slot: seat.slot, to: seat.pos })
  notes.push(`${seat.name}: ${why} — назад на ${by}`)
  followArrows(seat, fx, notes, true)
}

/** Сколько стрелок подряд можно пройти за раз. Предохранитель от круга:
 *  стрелка, ведущая на стрелку, ведущую обратно, гоняла бы фишку без конца. */
const ARROW_CHAIN_MAX = 4

/**
 * Встал на клетку со стрелкой — иди по ней, чем бы ни привело: кубиком,
 * встречей, дракой или Скиннером. И дальше, если там опять стрелка. На
 * клетку, где фишка уже была в этой цепочке, не возвращаемся. Красную
 * стрелку гасит [Чутьё опасности].
 */
function followArrows(seat: Seat, fx: BoardFx[], notes: string[], announce: boolean) {
  const seen = new Set([seat.pos])
  for (let hop = 0; hop < ARROW_CHAIN_MAX && seat.pos < BOARD_LAST; hop++) {
    const to = jumpTarget(seat.pos)
    if (to === null || seen.has(to)) return
    if (to < seat.pos && useShield(seat)) {
      notes.push(`${seat.name}: ${BOARD_SKILLS.danger.name} — красная стрелка не страшна`)
      return
    }
    // Первую стрелку после броска и так видно по клетке у кубика — пишем
    // только про те, что вышли следом.
    if (announce || hop > 0) notes.push(`${seat.name}: по стрелке на клетку ${to + 1}`)
    seat.pos = to
    seen.add(to)
    fx.push({ kind: 'jump', slot: seat.slot, to })
  }
}

/** Скиннер встретил игрока. Ловит всех подряд и сколько угодно раз. */
function skinnerCatches(seat: Seat, fx: BoardFx[], notes: string[]) {
  throwBack(seat, SKINNER_THROW, 'встреча со Скиннером', fx, notes)
}

function wakeSkinner(room: Room, fx: BoardFx[], notes: string[]) {
  if (room.skinner !== null) return
  if (!activeSeats(room).some(s => s.pos >= SKINNER_WAKES_AT)) return
  room.skinner = SKINNER_START
  fx.push({ kind: 'skinner', to: room.skinner })
  notes.push('Скиннер выходит из руин и идёт к таверне!')
}

/** Скиннер охотится до конца партии: бросает свой кубик и проходит ровно
 *  столько к ближайшему игроку — вперёд или назад, смотря где тот стоит.
 *  Может и проскочить: ловит, только если закончил ход на клетке игрока.
 *  Останавливайся он ровно на жертве, увернуться было бы нельзя — он будто
 *  угадывал ход. На старт он не ступает: там таверна. */
function moveSkinner(room: Room, fx: BoardFx[], notes: string[]) {
  if (room.skinner === null || room.status !== 'playing') return
  const from = room.skinner

  const prey = activeSeats(room)
  if (!prey.length) return

  const target = prey.reduce((a, b) => (Math.abs(b.pos - from) < Math.abs(a.pos - from) ? b : a))
  const dir = Math.sign(target.pos - from) || 1
  const step = randomInt(SKINNER_STEP_MIN, SKINNER_STEP_MAX + 1)
  const to = Math.min(Math.max(from + dir * step, 1), BOARD_LAST - 1)

  if (to !== from) {
    room.skinner = to
    fx.push({ kind: 'skinner', to })
  }
  for (const seat of prey) {
    if (seat.pos === to) skinnerCatches(seat, fx, notes)
  }
}

/** Встали на клетку, где уже кто-то стоит: оба бросают, меньший отступает.
 *  На старте и финише не встречаются — там места хватит всем. */
function duel(room: Room, seat: Seat, fx: BoardFx[], notes: string[]) {
  if (seat.pos <= 0 || seat.pos >= BOARD_LAST) return
  const other = activeSeats(room).find(s => s !== seat && s.pos === seat.pos)
  if (!other) return

  let mine = 0
  let theirs = 0
  // Ничью перебрасывают: иначе встреча слишком часто кончалась бы ничем.
  while (mine === theirs) {
    mine = randomInt(1, 7)
    theirs = randomInt(1, 7)
  }
  const [winner, loser] = mine > theirs ? [seat, other] : [other, seat]
  fx.push({ kind: 'duel', a: seat.slot, b: other.slot, va: mine, vb: theirs })
  notes.push(`Встреча на клетке: ${seat.name} — ${mine}, ${other.name} — ${theirs}`)
  throwBack(loser, DUEL_THROW, `проигрыш во встрече с игроком ${winner.name}`, fx, notes)
}

function roll(room: Room, seat: Seat, auto: boolean) {
  const fx: BoardFx[] = []
  const notes: string[] = []

  const values = [randomInt(1, 7)]
  if (seat.doubleNext) values.push(randomInt(1, 7))
  seat.doubleNext = false
  const dice = Math.max(...values)
  fx.push({ kind: 'dice', values })

  const from = seat.pos
  const steps: number[] = []
  for (let i = 1; i <= dice && from + i <= BOARD_LAST; i++) steps.push(from + i)
  seat.pos = steps.at(-1) ?? from
  fx.push({ kind: 'walk', slot: seat.slot, cells: steps })

  const landedAt = seat.pos
  const landed = BOARD_CELLS[landedAt]!
  let again = false

  if (seat.pos < BOARD_LAST) {
    const e = landed.effect
    // Повтор и пропуск — вслух: без строчки под кубиком казалось, что очередь
    // идёт как попало.
    if (e.kind === 'skip') {
      seat.skip++
      notes.push(`${seat.name} пропустит следующий ход`)
    } else if (e.kind === 'again') {
      again = true
      notes.push(`${seat.name} бросает ещё раз`)
    }

    followArrows(seat, fx, notes, false)

    // Встал на клетку Скиннера — сам к нему пришёл. Мимо пройти можно.
    if (room.skinner !== null && seat.pos === room.skinner) skinnerCatches(seat, fx, notes)

    if (landed.skill) {
      const skill = BOARD_SKILLS[landed.skill]
      if (seat.skills.length < BOARD_HAND_MAX) {
        seat.skills.push(landed.skill)
        notes.push(`Навык получен: ${skill.name}`)
      } else {
        notes.push(`${skill.name} — но в руке уже ${BOARD_HAND_MAX} навыка, этот пропал`)
      }
    }

    duel(room, seat, fx, notes)
  }

  wakeSkinner(room, fx, notes)

  const who = auto ? `${seat.name} (не на связи, кубик бросил стол)` : seat.name
  const effect = effectLabel(landed.effect)
  const shown = values.length > 1 ? `${values.join(' и ')} → ${dice}` : String(dice)
  log(room, `${who}: ${shown} — ${landed.text}${effect ? ` · ${effect}` : ''}`)

  if (seat.pos >= BOARD_LAST) {
    room.status = 'finished'
    room.winnerSlot = seat.slot
    notes.push(`${seat.name} доходит до финиша и побеждает!`)
  } else if (!again) {
    nextTurn(room, fx, notes)
  } else {
    room.skillUsed = false
    room.turnSince = Date.now()
  }

  for (const note of notes) log(room, note)
  room.lastAction = { id: ++room.seq, slot: seat.slot, landed: landedAt, fx, notes, auto }
  pushState(room)
}

export function playSkill(peer: any, skill: unknown, target: unknown) {
  const p = peerSeat(peer)
  if (!p) return
  const { room, seat } = p
  if (room.status !== 'playing') return
  if (room.seats[room.turn] !== seat) return fail(peer, 'Навык можно сыграть только в свой ход')
  if (room.skillUsed) return fail(peer, 'Один навык за ход')
  // [Чутьё опасности] не играют — оно срабатывает само.
  if (!isBoardSkill(skill) || skill === 'danger') return
  const at = seat.skills.indexOf(skill)
  if (at < 0) return fail(peer, 'Такого навыка у тебя нет')

  const fx: BoardFx[] = []
  const notes: string[] = []

  if (skill === 'double') {
    seat.doubleNext = true
    notes.push(`${seat.name} играет ${BOARD_SKILLS.double.name}: бросит два кубика`)
  } else {
    const victim = activeSeats(room).find(s => s.slot === target && s !== seat)
    if (!victim) return fail(peer, 'Выбери, с кем драться')
    notes.push(`${seat.name} играет ${BOARD_SKILLS.brawl.name} против игрока ${victim.name}`)
    throwBack(victim, BRAWL_THROW, 'удар в трактирной драке', fx, notes)
  }

  seat.skills.splice(at, 1)
  room.skillUsed = true
  for (const note of notes) log(room, note)
  room.lastAction = { id: ++room.seq, slot: seat.slot, landed: null, fx, notes, auto: false }
  pushState(room)
}

export function rollDice(peer: any) {
  const p = peerSeat(peer)
  if (!p) return
  const { room, seat } = p
  if (room.status !== 'playing') return
  if (room.seats[room.turn] !== seat) return fail(peer, 'Сейчас не твой ход')
  roll(room, seat, false)
}

export function postChat(peer: any, raw: unknown) {
  const p = peerSeat(peer)
  if (!p || typeof raw !== 'string') return
  const { room, seat } = p

  const text = raw.replace(/\s+/g, ' ').trim().slice(0, BOARD_CHAT_MAX)
  if (!text) return

  const now = Date.now()
  if (now - (lastChatAt.get(seat.userId) ?? 0) < CHAT_GAP_MS) return
  lastChatAt.set(seat.userId, now)

  const message: BoardChatMessage = { id: ++room.seq, slot: seat.slot, name: seat.name, text, at: now }
  room.chat.push(message)
  if (room.chat.length > CHAT_KEEP) room.chat.splice(0, room.chat.length - CHAT_KEEP)
  broadcast(room, { type: 'chat', message })
}

/** Встать из-за стола насовсем. В лобби место освобождается, в партии фишка
 *  остаётся на карте, но ход её пропускается. */
/** Ещё партия за тем же столом. Стол возвращается в ожидание: те, кто
 *  ушёл, освобождают места, остальные — снова на старте, без навыков, и
 *  Скиннер снова в руинах. Чат остаётся — это разговор за тем же столом. */
export function rematch(peer: any) {
  const p = peerSeat(peer)
  if (!p) return
  const { room, seat } = p
  if (room.status !== 'finished') return

  room.seats = room.seats.filter(s => !s.left)
  if (!room.seats.some(s => s.userId === room.hostUserId)) room.hostUserId = room.seats[0]?.userId ?? seat.userId
  if (seat.userId !== room.hostUserId) return fail(peer, 'Новую партию начинает хозяин стола')

  for (const s of room.seats) {
    s.pos = 0
    s.skip = 0
    s.skills = []
    s.doubleNext = false
  }
  room.status = 'lobby'
  room.turn = 0
  room.winnerSlot = null
  room.skinner = null
  room.lastAction = null
  room.skillUsed = false
  room.log = []
  log(room, `${seat.name} накрывает стол для новой партии`)
  pushState(room)
}

export function leaveRoom(peer: any) {
  const p = peerSeat(peer)
  if (!p) return
  const { room, seat } = p

  for (const [other, userId] of room.peers) if (userId === seat.userId) room.peers.delete(other)

  if (room.status === 'lobby') {
    room.seats = room.seats.filter(s => s !== seat)
    log(room, `${seat.name} встаёт из-за стола`)
    if (seat.userId === room.hostUserId && room.seats[0]) room.hostUserId = room.seats[0].userId
  } else if (room.status === 'playing') {
    seat.left = true
    log(room, `${seat.name} уходит из партии`)
    const active = room.seats.filter(s => !s.left)
    if (!active.length) {
      room.status = 'finished'
    } else if (room.seats[room.turn] === seat) {
      const notes: string[] = []
      nextTurn(room, [], notes)
      for (const note of notes) log(room, note)
    }
    if (seat.userId === room.hostUserId && active[0]) room.hostUserId = active[0].userId
  }

  if (!room.seats.length) rooms.delete(room.code)
  else pushState(room)
}

/** Соединение закрылось — вкладку закрыли или пропала связь. Место за
 *  столом остаётся: человек может вернуться. */
export function dropPeer(peer: any) {
  for (const room of rooms.values()) {
    if (!room.peers.delete(peer)) continue
    room.touchedAt = Date.now()
    pushState(room)
  }
}

/** Раз в несколько секунд: бросок за пропавшего игрока и уборка пустых комнат. */
function tick() {
  const now = Date.now()
  for (const room of rooms.values()) {
    if (room.peers.size) room.touchedAt = now
    else if (now - room.touchedAt > EMPTY_ROOM_MS) {
      rooms.delete(room.code)
      continue
    }

    if (room.status !== 'playing') continue
    const seat = room.seats[room.turn]
    if (seat && !isOnline(room, seat.userId) && now - room.turnSince > OFFLINE_TURN_MS) {
      roll(room, seat, true)
    }
  }
}

const g = globalThis as { __boardTick?: ReturnType<typeof setInterval> }
if (!g.__boardTick) {
  g.__boardTick = setInterval(tick, 5000)
  g.__boardTick.unref?.()
}
