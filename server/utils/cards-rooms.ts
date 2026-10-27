import { randomInt } from 'node:crypto'
import type { CardsRoomView, CardsServerMessage, Game, HeroId, Side } from '#shared/utils/cards'
import {
  CARDS_CODE_ALPHABET,
  CARDS_CODE_LENGTH,
  cardsApply,
  cardsCheck,
  cardsForfeit,
  cardsView,
  isCardsAction,
  isHeroTeam,
  newCardsGame,
} from '#shared/utils/cards'
import type { BoardUser } from './board-rooms'

/**
 * Столы «Карт таверны» на двоих. Как и настольная игра, живут в памяти
 * сервера: партия целиком здесь, браузер получает только свой вид (чужая
 * рука и колода скрыты) и шлёт ходы. Кубики бросает сервер.
 *
 * Люди и билеты к сокету — общие с настольной игрой (board-access.ts).
 */

type Seat = { userId: number; name: string; avatarUrl: string | null; team: HeroId[] | null; rematch: boolean }

type Room = {
  code: string
  seats: Seat[]
  game: Game | null
  /** Сколько партий сыграно: первым ходит то один, то другой. */
  games: number
  peers: Map<any, number>
  touchedAt: number
}

const rooms = new Map<string, Room>()

/** Пустой стол живёт полчаса — вдруг вернутся. */
const EMPTY_ROOM_MS = 30 * 60_000

function newCode(): string {
  let code = ''
  do {
    code = Array.from({ length: CARDS_CODE_LENGTH }, () => CARDS_CODE_ALPHABET[randomInt(CARDS_CODE_ALPHABET.length)]).join('')
  } while (rooms.has(code))
  return code
}

function viewFor(room: Room, side: Side): CardsRoomView {
  const online = new Set(room.peers.values())
  return {
    code: room.code,
    you: side,
    seats: room.seats.map(s => ({ name: s.name, avatarUrl: s.avatarUrl, team: s.team, online: online.has(s.userId), rematch: s.rematch })),
    game: room.game ? cardsView(room.game, side) : null,
  }
}

function send(peer: any, msg: CardsServerMessage) {
  try { peer.send(JSON.stringify(msg)) } catch {}
}

/** Каждому — свой вид стола. */
function push(room: Room) {
  for (const [peer, userId] of room.peers) {
    const side = room.seats.findIndex(s => s.userId === userId)
    if (side < 0) continue
    try { peer.send(JSON.stringify({ type: 'room', room: viewFor(room, side as Side) } satisfies CardsServerMessage)) }
    catch { room.peers.delete(peer) }
  }
  // Цифры над героями — только к ходу, где всё случилось: следующая рассылка
  // (кто-то отключился, попросил реванш) не должна показывать их заново.
  if (room.game) room.game.fx = []
}

const fail = (peer: any, message: string) => send(peer, { type: 'error', message })

export function createCardsRoom(): string {
  const code = newCode()
  rooms.set(code, { code, seats: [], game: null, games: 0, peers: new Map(), touchedAt: Date.now() })
  return code
}

export function joinCardsRoom(code: string, user: BoardUser, peer: any): string | null {
  const room = rooms.get(code)
  if (!room) return 'Такого стола нет — может, его уже убрали'
  let seat = room.seats.find(s => s.userId === user.id)
  if (!seat) {
    if (room.seats.length >= 2) return 'За этим столом уже двое'
    seat = { userId: user.id, name: user.name, avatarUrl: user.avatarUrl, team: null, rematch: false }
    room.seats.push(seat)
  } else {
    seat.name = user.name
    seat.avatarUrl = user.avatarUrl
  }
  room.peers.set(peer, user.id)
  room.touchedAt = Date.now()
  push(room)
  return null
}

type Found = { room: Room; seat: Seat; side: Side }

function find(peer: any): Found | null {
  for (const room of rooms.values()) {
    const userId = room.peers.get(peer)
    if (userId === undefined) continue
    const side = room.seats.findIndex(s => s.userId === userId)
    if (side >= 0) return { room, seat: room.seats[side]!, side: side as Side }
  }
  return null
}

function startGame(room: Room) {
  const [a, b] = room.seats
  if (!a?.team || !b?.team) return
  room.game = newCardsGame(a.team, b.team, randomInt(2 ** 31), {
    vs: 'online',
    names: [a.name, b.name],
    first: (room.games % 2) as Side,
  })
  room.games++
  for (const s of room.seats) s.rematch = false
}

/** Отряд выбирают до партии; когда выбрали оба — партия начинается. */
export function chooseCardsTeam(peer: any, team: unknown) {
  const f = find(peer)
  if (!f) return
  if (f.room.game && f.room.game.phase !== 'over') return fail(peer, 'Партия уже идёт')
  if (!isHeroTeam(team)) return fail(peer, 'Нужно три разных героя')
  f.seat.team = [...team]
  if (f.room.seats.length === 2 && f.room.seats.every(s => s.team) && !f.room.game) startGame(f.room)
  push(f.room)
}

export function cardsAct(peer: any, action: unknown) {
  const f = find(peer)
  if (!f?.room.game) return
  if (!isCardsAction(action)) return fail(peer, 'Непонятный ход')
  const c = cardsCheck(f.room.game, f.side, action)
  if (!c.ok) return fail(peer, c.why)
  f.room.game = cardsApply(f.room.game, f.side, action)
  push(f.room)
}

/** Реванш тем же составом: когда попросили оба. */
export function cardsRematch(peer: any) {
  const f = find(peer)
  if (!f || f.room.game?.phase !== 'over') return
  f.seat.rematch = true
  if (f.room.seats.length === 2 && f.room.seats.every(s => s.rematch)) startGame(f.room)
  push(f.room)
}

/** Ушёл посреди партии — соперник побеждает; до партии — место свободно. */
export function leaveCardsRoom(peer: any) {
  const f = find(peer)
  if (!f) return
  const { room, seat, side } = f
  for (const [p, userId] of room.peers) if (userId === seat.userId) room.peers.delete(p)
  if (room.game && room.game.phase !== 'over') room.game = cardsForfeit(room.game, side)
  if (!room.game) room.seats = room.seats.filter(s => s !== seat)
  if (!room.peers.size && !room.seats.length) rooms.delete(room.code)
  else push(room)
}

export function dropCardsPeer(peer: any) {
  for (const room of rooms.values()) {
    if (!room.peers.delete(peer)) continue
    room.touchedAt = Date.now()
    push(room)
  }
}

function tick() {
  const now = Date.now()
  for (const room of rooms.values()) {
    if (room.peers.size) room.touchedAt = now
    else if (now - room.touchedAt > EMPTY_ROOM_MS) rooms.delete(room.code)
  }
}

const g = globalThis as { __cardsTick?: ReturnType<typeof setInterval> }
if (!g.__cardsTick) {
  g.__cardsTick = setInterval(tick, 60_000)
  g.__cardsTick.unref?.()
}
