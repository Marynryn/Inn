import { randomInt } from 'node:crypto'
import type {
  BoardAction,
  BoardChatMessage,
  BoardFx,
  BoardLogEntry,
  BoardPlayer,
  BoardServerMessage,
  BoardSkill,
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
import { wsToUser, wsUsers } from './ws-rooms'

/**
 * Комнаты настольной игры живут в памяти сервера, а не в базе: партия идёт
 * минуты, а сервер у сайта один. Перезапуск сервера партии обрывает — для
 * пробы это честная цена; если игра приживётся, состояние переедет в базу.
 */

type Seat = Omit<BoardPlayer, 'wins'> & { userId: number; admin: boolean }

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
  /** Выпало два кубика — ждём, на какой из них игрок пойдёт. */
  choice: number[] | null
  log: BoardLogEntry[]
  /** Победы за этим столом — по читателю, а не по месту: кто встал из-за
   *  стола в лобби и сел снова, свой счёт не теряет. */
  wins: Map<number, number>
  games: number
  chat: BoardChatMessage[]
  peers: Map<any, number>
  /** Когда ход перешёл к нынешнему игроку — для автоброска за ушедшего. */
  turnSince: number
  /** Когда в комнате последний раз кто-то был — пустые подчищаются. */
  touchedAt: number
  seq: number
}

export type BoardUser = { id: number; name: string; avatarUrl: string | null; admin: boolean }

/** Партия доиграна до финиша — для статистики. Сама запись в базу живёт
 *  снаружи (server/plugins/board-stats.ts): комнатам база ни к чему. */
let onFinished: ((onlyAdmins: boolean) => void) | null = null
export function setBoardFinishedHook(fn: (onlyAdmins: boolean) => void) { onFinished = fn }

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
    nextHostSlot: room.status === 'finished' ? nextHost(room)?.slot ?? null : null,
    turnSlot: room.status === 'playing' ? room.seats[room.turn]?.slot ?? null : null,
    winnerSlot: room.winnerSlot,
    players: room.seats.map(({ userId, admin, ...p }) => ({ ...p, online: isOnline(room, userId), wins: room.wins.get(userId) ?? 0 })),
    skinner: room.skinner,
    skillUsed: room.skillUsed,
    choice: room.status === 'playing' ? room.choice : null,
    lastAction: room.lastAction,
    log: room.log,
    games: room.games,
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
    choice: null,
    log: [],
    wins: new Map(),
    games: 0,
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

/** Стол, который ищет игроков, — для приглашения в шаре: первый открытый,
 *  за которым этот читатель ещё не сидит. */
export function invitingRoomFor(userId: number) {
  return openRooms().find(r => !rooms.get(r.code)!.seats.some(s => s.userId === userId)) ?? null
}

/** Открытых столов стало больше или меньше — шары у всех, кто на сайте,
 *  пересчитываются: иначе приглашение висело бы до перезагрузки страницы. */
let openCount = -1
function nudgeOpenTables() {
  const n = openRooms().length
  if (n === openCount) return
  openCount = n
  for (const userId of wsUsers.keys()) wsToUser(userId, { type: 'notification' })
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
      admin: user.admin,
      slot,
      name: user.name,
      avatarUrl: user.avatarUrl,
      color: BOARD_COLORS[slot]!,
      pos: 0,
      skip: 0,
      skills: [],
      doubleNext: false,
      bonus: 0,
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
  nudgeOpenTables()
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
  if (seat.userId !== room.hostUserId) return fail(peer, 'Начать партию может только тот, чья очередь начинать')
  if (room.seats.length < BOARD_MIN_PLAYERS) return fail(peer, 'Мало игроков')

  room.status = 'playing'
  // Первым ходит тот, кто начал партию: за одним столом партии начинают по кругу.
  room.turn = Math.max(0, room.seats.findIndex(s => s.userId === room.hostUserId))
  room.turnSince = Date.now()
  log(room, `Партия началась. Первым ходит ${room.seats[room.turn]!.name}`)
  pushState(room)
  nudgeOpenTables()
}

/** Передать ход следующему, пропуская ушедших и тех, кто пропускает ход.
 *  Круг замкнулся — Скиннер делает свой ход; его шаги дописываются в то
 *  действие, после которого круг кончился. */
function nextTurn(room: Room, ctx: Ctx = newCtx(room, null)) {
  const n = room.seats.length
  for (let tries = 0; tries < n * 4; tries++) {
    const prev = room.turn
    room.turn = (room.turn + 1) % n
    if (room.turn <= prev) moveSkinner(ctx)
    const seat = room.seats[room.turn]!
    if (seat.left) continue
    if (seat.skip > 0) {
      seat.skip--
      ctx.notes.push(`${seat.name} пропускает ход`)
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

/** Всё, что случилось за одно действие: шаги анимации, строчки под кубиком,
 *  чей это ход и предохранители от бесконечных цепочек. */
type Ctx = {
  room: Room
  fx: BoardFx[]
  notes: string[]
  /** Чей ход. «Ещё бросок» ему — сразу, остальным — в их ход. */
  mover: Seat | null
  again: boolean
  /** Сколько клеток уже разобрано за действие — потолок от круга. */
  hops: number
  /** Встреча — одна за действие: проигравший, отступив, мог бы встать на
   *  чужую клетку и начать следующую, и так без конца. */
  dueled: boolean
}

const newCtx = (room: Room, mover: Seat | null): Ctx =>
  ({ room, fx: [], notes: [], mover, again: false, hops: 0, dueled: false })

/** Сколько клеток можно разобрать за одно действие. Стрелка на стрелку, что
 *  ведёт обратно, или Скиннер с отбросом на стрелку к нему же гоняли бы
 *  фишку без конца. */
const HOPS_MAX = 8

function grantSkill(seat: Seat, skill: BoardSkill, notes: string[]) {
  const name = BOARD_SKILLS[skill].name
  if (seat.skills.length < BOARD_HAND_MAX) {
    seat.skills.push(skill)
    notes.push(`${seat.name}: навык получен — ${name}`)
  } else {
    notes.push(`${seat.name}: ${name} — но в руке уже ${BOARD_HAND_MAX} навыка, этот пропал`)
  }
}

/** Отбросить назад — если не спасёт [Чутьё опасности]. На новой клетке
 *  срабатывает всё, что там есть. */
function throwBack(ctx: Ctx, seat: Seat, by: number, why: string) {
  if (useShield(seat)) {
    ctx.notes.push(`${seat.name}: ${why}, но ${BOARD_SKILLS.danger.name} спасает`)
    return
  }
  seat.pos = Math.max(0, seat.pos - by)
  ctx.fx.push({ kind: 'push', slot: seat.slot, to: seat.pos })
  ctx.notes.push(`${seat.name}: ${why} — назад на ${by}`)
  landOn(ctx, seat, false)
}

/**
 * Фишка встала на клетку — чем бы ни привело: кубиком, стрелкой, встречей,
 * дракой или Скиннером. Срабатывает всё, что на клетке есть, одинаково:
 * пропуск хода, ещё бросок, навык, Скиннер, встреча, стрелка — а после
 * стрелки то же самое на клетке, куда она привела.
 *
 * byDice — сюда пришли по кубику: первую стрелку тогда видно по клетке у
 * кубика, и строчкой её не дублируем.
 */
function landOn(ctx: Ctx, seat: Seat, byDice: boolean) {
  const { room, notes } = ctx
  const seen = new Set<number>()

  while (seat.pos < BOARD_LAST && ctx.hops < HOPS_MAX) {
    ctx.hops++
    const at = seat.pos
    seen.add(at)
    const cell = BOARD_CELLS[at]!

    if (cell.effect.kind === 'skip') {
      seat.skip++
      notes.push(`${seat.name} пропустит следующий ход`)
    } else if (cell.effect.kind === 'again') {
      if (seat === ctx.mover) {
        ctx.again = true
        notes.push(`${seat.name} бросает ещё раз`)
      } else {
        seat.bonus++
        notes.push(`${seat.name}: ещё бросок — в свой ход`)
      }
    }

    if (cell.skill) grantSkill(seat, cell.skill, notes)

    // Пришёл на клетку Скиннера — сам к нему пришёл.
    if (room.skinner !== null && at === room.skinner) {
      throwBack(ctx, seat, SKINNER_THROW, 'встреча со Скиннером')
      if (seat.pos !== at) return
    }

    if (!ctx.dueled && at > 0) {
      const other = activeSeats(room).find(s => s !== seat && s.pos === at)
      if (other) {
        duel(ctx, seat, other)
        if (seat.pos !== at) return
      }
    }

    const to = jumpTarget(at)
    if (to === null || seen.has(to)) return
    if (to < at && useShield(seat)) {
      notes.push(`${seat.name}: ${BOARD_SKILLS.danger.name} — красная стрелка не страшна`)
      return
    }
    if (!byDice || seen.size > 1) notes.push(`${seat.name}: по стрелке на клетку ${to + 1}`)
    seat.pos = to
    ctx.fx.push({ kind: 'jump', slot: seat.slot, to })
  }
}

/** Скиннер вышел из руин, когда кто-то забрался достаточно далеко. */
function wakeSkinner(ctx: Ctx) {
  const { room } = ctx
  if (room.skinner !== null) return
  if (!activeSeats(room).some(s => s.pos >= SKINNER_WAKES_AT)) return
  room.skinner = SKINNER_START
  ctx.fx.push({ kind: 'skinner', to: room.skinner })
  ctx.notes.push('Скиннер выходит из руин и идёт к таверне!')
}

/** Скиннер охотится до конца партии: бросает свой кубик и проходит ровно
 *  столько к ближайшему игроку — вперёд или назад, смотря где тот стоит.
 *  Может и проскочить: ловит, только если закончил ход на клетке игрока.
 *  Останавливайся он ровно на жертве, увернуться было бы нельзя — он будто
 *  угадывал ход. На старт он не ступает: там таверна. */
function moveSkinner(ctx: Ctx) {
  const { room } = ctx
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
    ctx.fx.push({ kind: 'skinner', to })
  }
  for (const seat of prey) {
    if (seat.pos === to) throwBack(ctx, seat, SKINNER_THROW, 'встреча со Скиннером')
  }
}

/** Встали на одну клетку: оба бросают, меньший отступает. На старте не
 *  встречаются — там места хватит всем. */
function duel(ctx: Ctx, seat: Seat, other: Seat) {
  ctx.dueled = true
  let mine = 0
  let theirs = 0
  // Ничью перебрасывают: иначе встреча слишком часто кончалась бы ничем.
  while (mine === theirs) {
    mine = randomInt(1, 7)
    theirs = randomInt(1, 7)
  }
  const [winner, loser] = mine > theirs ? [seat, other] : [other, seat]
  ctx.fx.push({ kind: 'duel', a: seat.slot, b: other.slot, va: mine, vb: theirs })
  ctx.notes.push(`Встреча на клетке: ${seat.name} — ${mine}, ${other.name} — ${theirs}`)
  throwBack(ctx, loser, DUEL_THROW, `проигрыш во встрече с игроком ${winner.name}`)
}

/** Кто дошёл до финиша. По стрелке вперёд туда может занести и не того, чей
 *  ход, — тогда побеждает он. Если дошли двое, первым считается ходивший. */
function finisher(ctx: Ctx): Seat | null {
  const done = activeSeats(ctx.room).filter(s => s.pos >= BOARD_LAST)
  return done.find(s => s === ctx.mover) ?? done[0] ?? null
}

/** Закончить действие: победа, следующий ход или ещё бросок того же игрока. */
function finishAction(ctx: Ctx, slot: number, landed: number | null, auto: boolean) {
  const { room, notes } = ctx
  const won = finisher(ctx)
  if (won) {
    room.status = 'finished'
    room.winnerSlot = won.slot
    room.wins.set(won.userId, (room.wins.get(won.userId) ?? 0) + 1)
    room.games++
    room.choice = null
    try { onFinished?.(room.seats.every(s => s.admin)) } catch {}
    notes.push(`${won.name} доходит до финиша и побеждает!`)
  } else if (ctx.again) {
    room.skillUsed = false
    room.turnSince = Date.now()
  } else if (landed !== null) {
    nextTurn(room, ctx)
  }

  for (const note of notes) log(room, note)
  room.lastAction = { id: ++room.seq, slot, landed, fx: ctx.fx, notes, auto }
  pushState(room)
}

/** Бросок. Двумя кубиками ([Безупречный бросок]) — сперва выбор, на какой
 *  идти: больший не всегда лучше. За того, кто не на связи, стол берёт больший. */
function roll(room: Room, seat: Seat, auto: boolean) {
  const values = [randomInt(1, 7)]
  if (seat.doubleNext) values.push(randomInt(1, 7))
  seat.doubleNext = false

  if (values.length > 1 && !auto) {
    room.choice = values
    const note = `${seat.name}: выпало ${values[0]} и ${values[1]} — выбирает, на сколько идти`
    log(room, note)
    room.lastAction = { id: ++room.seq, slot: seat.slot, landed: null, fx: [{ kind: 'dice', values }], notes: [note], auto }
    room.turnSince = Date.now()
    pushState(room)
    return
  }

  move(room, seat, Math.max(...values), values, auto)
}

/** Пройти выпавшее и разобрать, куда пришли. shownDice — показать кубик:
 *  после выбора из двух кубики уже на экране. */
function move(room: Room, seat: Seat, dice: number, shownDice: number[] | null, auto: boolean) {
  const ctx = newCtx(room, seat)
  if (shownDice) ctx.fx.push({ kind: 'dice', values: shownDice })

  const from = seat.pos
  const steps: number[] = []
  for (let i = 1; i <= dice && from + i <= BOARD_LAST; i++) steps.push(from + i)
  seat.pos = steps.at(-1) ?? from
  ctx.fx.push({ kind: 'walk', slot: seat.slot, cells: steps })

  const landedAt = seat.pos
  const landed = BOARD_CELLS[landedAt]!
  const who = auto ? `${seat.name} (не на связи, кубик бросил стол)` : seat.name
  const effect = effectLabel(landed.effect)
  log(room, `${who}: ${dice} — ${landed.text}${effect ? ` · ${effect}` : ''}`)

  landOn(ctx, seat, true)
  wakeSkinner(ctx)

  // «Ещё бросок», заработанный в чужой ход, — сейчас, после своего.
  if (!ctx.again && seat.bonus > 0 && seat.pos < BOARD_LAST) {
    seat.bonus--
    ctx.again = true
    ctx.notes.push(`${seat.name} бросает ещё раз — бросок из запаса`)
  }

  finishAction(ctx, seat.slot, landedAt, auto)
}

export function chooseDice(peer: any, index: unknown) {
  const p = peerSeat(peer)
  if (!p) return
  const { room, seat } = p
  if (room.status !== 'playing' || !room.choice) return
  if (room.seats[room.turn] !== seat) return fail(peer, 'Сейчас не твой ход')
  if (index !== 0 && index !== 1) return
  const dice = room.choice[index]!
  room.choice = null
  move(room, seat, dice, null, false)
}

export function playSkill(peer: any, skill: unknown, target: unknown) {
  const p = peerSeat(peer)
  if (!p) return
  const { room, seat } = p
  if (room.status !== 'playing') return
  if (room.seats[room.turn] !== seat) return fail(peer, 'Навык можно сыграть только в свой ход')
  if (room.choice) return fail(peer, 'Сначала выбери кубик')
  if (room.skillUsed) return fail(peer, 'Один навык за ход')
  // [Чутьё опасности] не играют — оно срабатывает само.
  if (!isBoardSkill(skill) || skill === 'danger') return
  const at = seat.skills.indexOf(skill)
  if (at < 0) return fail(peer, 'Такого навыка у тебя нет')

  const victim = skill === 'brawl' ? activeSeats(room).find(s => s.slot === target && s !== seat) : null
  if (skill === 'brawl' && !victim) return fail(peer, 'Выбери, с кем драться')

  seat.skills.splice(at, 1)
  room.skillUsed = true
  const ctx = newCtx(room, seat)

  if (skill === 'double') {
    seat.doubleNext = true
    ctx.notes.push(`${seat.name} играет ${BOARD_SKILLS.double.name}: бросит два кубика и выберет`)
  } else {
    ctx.notes.push(`${seat.name} играет ${BOARD_SKILLS.brawl.name} против игрока ${victim!.name}`)
    throwBack(ctx, victim!, BRAWL_THROW, 'удар в трактирной драке')
  }

  // Ход после навыка не переходит: бросок ещё впереди.
  ctx.again = true
  finishAction(ctx, seat.slot, null, false)
}

export function rollDice(peer: any) {
  const p = peerSeat(peer)
  if (!p) return
  const { room, seat } = p
  if (room.status !== 'playing') return
  if (room.seats[room.turn] !== seat) return fail(peer, 'Сейчас не твой ход')
  if (room.choice) return fail(peer, 'Сначала выбери кубик')
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

  // Новую партию начинает следующий по кругу. Пропал со связи — может любой,
  // иначе стол так и стоял бы.
  const next = nextHost(room)
  if (next && next !== seat && isOnline(room, next.userId)) {
    return fail(peer, `Новую партию начинает ${next.name}`)
  }
  room.hostUserId = (next ?? seat).userId
  room.seats = room.seats.filter(s => !s.left)

  for (const s of room.seats) {
    s.pos = 0
    s.skip = 0
    s.skills = []
    s.doubleNext = false
    s.bonus = 0
  }
  room.choice = null
  room.status = 'lobby'
  room.turn = 0
  room.winnerSlot = null
  room.skinner = null
  room.lastAction = null
  room.skillUsed = false
  room.log = []
  log(room, `${seat.name} накрывает стол для новой партии`)
  pushState(room)
  nudgeOpenTables()
}

/** Следующий по кругу после того, кто начинал партию, — из тех, кто ещё за столом. */
function nextHost(room: Room): Seat | null {
  const stay = room.seats.filter(s => !s.left)
  if (!stay.length) return null
  const at = room.seats.findIndex(s => s.userId === room.hostUserId)
  for (let k = 1; k <= room.seats.length; k++) {
    const s = room.seats[(Math.max(at, 0) + k) % room.seats.length]!
    if (!s.left) return s
  }
  return stay[0]!
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
      room.choice = null
      const ctx = newCtx(room, null)
      nextTurn(room, ctx)
      for (const note of ctx.notes) log(room, note)
    }
    if (seat.userId === room.hostUserId && active[0]) room.hostUserId = active[0].userId
  }

  if (!room.seats.length) {
    rooms.delete(room.code)
    nudgeOpenTables()
    return
  }
  pushState(room)
  nudgeOpenTables()
  // Уход — заметно всем, а не только строчкой в журнале.
  broadcast(room, { type: 'event', text: `${seat.name} больше не за столом` })
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
      nudgeOpenTables()
      continue
    }

    if (room.status !== 'playing') continue
    const seat = room.seats[room.turn]
    if (seat && !isOnline(room, seat.userId) && now - room.turnSince > OFFLINE_TURN_MS) {
      // Пропал, не выбрав кубик, — стол берёт больший.
      if (room.choice) {
        const dice = Math.max(...room.choice)
        room.choice = null
        move(room, seat, dice, null, true)
      } else {
        roll(room, seat, true)
      }
    }
  }
}

const g = globalThis as { __boardTick?: ReturnType<typeof setInterval> }
if (!g.__boardTick) {
  g.__boardTick = setInterval(tick, 5000)
  g.__boardTick.unref?.()
}
