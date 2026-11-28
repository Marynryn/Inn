import { randomInt } from "node:crypto";
import type {
  BoardAction,
  BoardChatMessage,
  BoardFx,
  BoardHunter,
  BoardLogEntry,
  BoardMap,
  BoardMapId,
  BoardPlayer,
  BoardServerMessage,
  BoardSkill,
  BoardState,
  BoardStatus,
} from "#shared/utils/board";
import {
  ARMY_STEP,
  BOARD_HAND_MAX,
  BOARD_MAPS,
  BOARD_SKILLS,
  BOARD_STRIKES,
  DUEL_THROW,
  FARE_BONUS,
  HUNTER_STEP_MAX,
  HUNTER_STEP_MIN,
  HUNTER_THROW,
  BOARD_CHAT_MAX,
  BOARD_CODE_ALPHABET,
  BOARD_CODE_LENGTH,
  BOARD_COLORS,
  BOARD_MAX_PLAYERS,
  BOARD_MIN_PLAYERS,
  boardLast,
  effectLabel,
  isBoardSkill,
  jumpTarget,
} from "#shared/utils/board";
import { wsToUser, wsUsers } from "./ws-rooms";

/**
 * Комнаты настольной игры живут в памяти сервера, а не в базе: партия идёт
 * минуты, а сервер у сайта один. Перезапуск сервера партии обрывает — для
 * пробы это честная цена; если игра приживётся, состояние переедет в базу.
 */

type Seat = Omit<BoardPlayer, "wins"> & { userId: number; admin: boolean };

type Room = {
  code: string;
  /** Карта стола: выбирают, когда накрывают, и все партии идут по ней. */
  map: BoardMap;
  status: BoardStatus;
  hostUserId: number;
  seats: Seat[];
  turn: number;
  winnerSlot: number | null;
  /** Охотники карты, в том же порядке, что в её описании. */
  hunters: BoardHunter[];
  lastAction: BoardAction | null;
  /** Навык уже сыгран в этот ход — второй нельзя. */
  skillUsed: boolean;
  /** Выпало два кубика — ждём, на какой из них игрок пойдёт. */
  choice: number[] | null;
  log: BoardLogEntry[];
  /** Победы за этим столом — по читателю, а не по месту: кто встал из-за
   *  стола в лобби и сел снова, свой счёт не теряет. */
  wins: Map<number, number>;
  games: number;
  chat: BoardChatMessage[];
  peers: Map<any, number>;
  /** Когда ход перешёл к нынешнему игроку — для автоброска за ушедшего. */
  turnSince: number;
  /** Когда в комнате последний раз кто-то был — пустые подчищаются. */
  touchedAt: number;
  seq: number;
};

export type BoardUser = {
  id: number;
  name: string;
  avatarUrl: string | null;
  admin: boolean;
};

/** Партия доиграна до финиша — для статистики. Сама запись в базу живёт
 *  снаружи (server/plugins/board-stats.ts): комнатам база ни к чему. */
let onFinished: ((onlyAdmins: boolean) => void) | null = null;
export function setBoardFinishedHook(fn: (onlyAdmins: boolean) => void) {
  onFinished = fn;
}

const rooms = new Map<string, Room>();
/** Последнее сообщение в чат по читателю — чтобы не заливали. */
const lastChatAt = new Map<number, number>();

const LOG_MAX = 30;
const CHAT_KEEP = 100;
const CHAT_GAP_MS = 700;
/** Сколько ждать игрока без связи, прежде чем бросить кубик за него. */
const OFFLINE_TURN_MS = 30_000;
/** Пустая комната живёт полчаса: вдруг все просто перезагрузили страницу. */
const EMPTY_ROOM_MS = 30 * 60_000;

function newCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < BOARD_CODE_LENGTH; i++)
      code += BOARD_CODE_ALPHABET[randomInt(BOARD_CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}

const isOnline = (room: Room, userId: number) =>
  [...room.peers.values()].includes(userId);

function stateOf(room: Room): BoardState {
  const host = room.seats.find((s) => s.userId === room.hostUserId);
  return {
    code: room.code,
    map: room.map.id,
    status: room.status,
    hostSlot: host?.slot ?? -1,
    nextHostSlot:
      room.status === "finished" ? (nextHost(room)?.slot ?? null) : null,
    turnSlot:
      room.status === "playing" ? (room.seats[room.turn]?.slot ?? null) : null,
    winnerSlot: room.winnerSlot,
    players: room.seats.map(({ userId, admin, ...p }) => ({
      ...p,
      online: isOnline(room, userId),
      wins: room.wins.get(userId) ?? 0,
    })),
    hunters: room.hunters,
    skillUsed: room.skillUsed,
    choice: room.status === "playing" ? room.choice : null,
    lastAction: room.lastAction,
    log: room.log,
    games: room.games,
  };
}

function send(peer: any, msg: BoardServerMessage) {
  try {
    peer.send(JSON.stringify(msg));
  } catch {}
}

function broadcast(room: Room, msg: BoardServerMessage) {
  const text = JSON.stringify(msg);
  for (const peer of room.peers.keys()) {
    try {
      peer.send(text);
    } catch {
      room.peers.delete(peer);
    }
  }
}

const pushState = (room: Room) =>
  broadcast(room, { type: "state", state: stateOf(room) });

function log(room: Room, text: string) {
  room.log.push({ id: ++room.seq, text });
  if (room.log.length > LOG_MAX) room.log.splice(0, room.log.length - LOG_MAX);
}

const freshHunters = (map: BoardMap): BoardHunter[] =>
  map.hunters.map((h) => ({ kind: h.kind, at: null }));

export function createRoom(host: BoardUser, mapId: BoardMapId = "v1"): string {
  const code = newCode();
  const map = BOARD_MAPS[mapId];
  rooms.set(code, {
    code,
    map,
    status: "lobby",
    hostUserId: host.id,
    seats: [],
    turn: 0,
    winnerSlot: null,
    hunters: freshHunters(map),
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
  });
  return code;
}

/** Открытые комнаты — те, что ещё набирают игроков и где кто-то сейчас на
 *  связи: за брошенный стол сесть можно, но начать партию там некому. */
export function openRooms() {
  return [...rooms.values()]
    .filter(
      (r) =>
        r.status === "lobby" &&
        r.peers.size > 0 &&
        r.seats.length > 0 &&
        r.seats.length < BOARD_MAX_PLAYERS,
    )
    .map((r) => ({
      code: r.code,
      map: r.map.title,
      host: r.seats.find((s) => s.userId === r.hostUserId)?.name ?? null,
      players: r.seats.length,
      max: BOARD_MAX_PLAYERS,
    }));
}

/** Стол, который ищет игроков, — для приглашения в шаре: первый открытый,
 *  за которым этот читатель ещё не сидит. */
export function invitingRoomFor(userId: number) {
  return (
    openRooms().find(
      (r) => !rooms.get(r.code)!.seats.some((s) => s.userId === userId),
    ) ?? null
  );
}

/** Открытых столов стало больше или меньше — шары у всех, кто на сайте,
 *  пересчитываются: иначе приглашение висело бы до перезагрузки страницы. */
let openCount = -1;
function nudgeOpenTables() {
  const n = openRooms().length;
  if (n === openCount) return;
  openCount = n;
  for (const userId of wsUsers.keys())
    wsToUser(userId, { type: "notification" });
}

/** Комната, где этот читатель сидит в незаконченной партии, — чтобы вернуть его. */
export function roomOfUser(userId: number): string | null {
  for (const r of rooms.values()) {
    if (
      r.status !== "finished" &&
      r.seats.some((s) => s.userId === userId && !s.left)
    )
      return r.code;
  }
  return null;
}

export function joinRoom(
  code: string,
  user: BoardUser,
  peer: any,
): string | null {
  const room = rooms.get(code);
  if (!room) return "Такого стола нет — может, партия уже закончилась";
  // Одно соединение — одна комната: второе приглашение на том же сокете не в счёт.
  if (peerSeat(peer)) return null;

  let seat = room.seats.find((s) => s.userId === user.id);
  if (!seat) {
    if (room.status !== "lobby")
      return "Партия уже идёт, новых игроков не берут";
    if (room.seats.length >= BOARD_MAX_PLAYERS) return "За столом нет мест";
    const used = new Set(room.seats.map((s) => s.slot));
    const slot = [0, 1, 2, 3].find((n) => !used.has(n))!;
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
      fareNext: false,
      bonus: 0,
      online: true,
      left: false,
    };
    room.seats.push(seat);
    log(room, `${user.name} садится за стол`);
  } else {
    // Имя и аватарка могли смениться, пока человек был вне комнаты.
    seat.name = user.name;
    seat.avatarUrl = user.avatarUrl;
    if (seat.left && room.status !== "finished") {
      seat.left = false;
      log(room, `${user.name} возвращается за стол`);
    }
  }

  // Стол стоял пустым — партия замирала. Отсчёт до автоброска начинаем
  // заново, иначе за отставшего бросили бы в ту же секунду.
  if (!room.peers.size) room.turnSince = Date.now();
  room.peers.set(peer, user.id);
  room.touchedAt = Date.now();
  send(peer, {
    type: "joined",
    you: seat.slot,
    state: stateOf(room),
    chat: room.chat,
  });
  pushState(room);
  nudgeOpenTables();
  return null;
}

type Peer = { room: Room; seat: Seat };

function peerSeat(peer: any): Peer | null {
  for (const room of rooms.values()) {
    const userId = room.peers.get(peer);
    if (userId === undefined) continue;
    const seat = room.seats.find((s) => s.userId === userId);
    return seat ? { room, seat } : null;
  }
  return null;
}

const fail = (peer: any, message: string) =>
  send(peer, { type: "error", message });

export function startGame(peer: any) {
  const p = peerSeat(peer);
  if (!p) return;
  const { room, seat } = p;
  if (room.status !== "lobby") return;
  if (seat.userId !== room.hostUserId)
    return fail(peer, "Начать партию может только тот, чья очередь начинать");
  if (room.seats.length < BOARD_MIN_PLAYERS) return fail(peer, "Мало игроков");

  room.status = "playing";
  // Первым ходит тот, кто начал партию: за одним столом партии начинают по кругу.
  room.turn = Math.max(
    0,
    room.seats.findIndex((s) => s.userId === room.hostUserId),
  );
  room.turnSince = Date.now();
  log(room, `Партия началась. Первым ходит ${room.seats[room.turn]!.name}`);
  pushState(room);
  nudgeOpenTables();
}

/** Передать ход следующему, пропуская ушедших и тех, кто пропускает ход.
 *  Круг замкнулся — охотники делают свой ход; их шаги дописываются в то
 *  действие, после которого круг кончился. */
function nextTurn(room: Room, ctx: Ctx = newCtx(room, null)) {
  const n = room.seats.length;
  for (let tries = 0; tries < n * 4; tries++) {
    const prev = room.turn;
    room.turn = (room.turn + 1) % n;
    if (room.turn <= prev) moveHunters(ctx);
    const seat = room.seats[room.turn]!;
    if (seat.left) continue;
    if (seat.skip > 0) {
      seat.skip--;
      ctx.notes.push(`${seat.name} пропускает ход`);
      continue;
    }
    break;
  }
  room.skillUsed = false;
  room.turnSince = Date.now();
}

const activeSeats = (room: Room) => room.seats.filter((s) => !s.left);

/** Забрать [Чутьё опасности], если оно есть: оно гасит одну беду. */
function useShield(seat: Seat): boolean {
  const at = seat.skills.indexOf("danger");
  if (at < 0) return false;
  seat.skills.splice(at, 1);
  return true;
}

/** Всё, что случилось за одно действие: шаги анимации, строчки под кубиком,
 *  чей это ход и предохранители от бесконечных цепочек. */
type Ctx = {
  room: Room;
  fx: BoardFx[];
  notes: string[];
  /** Чей ход. «Ещё бросок» ему — сразу, остальным — в их ход. */
  mover: Seat | null;
  again: boolean;
  /** Сколько клеток уже разобрано за действие — потолок от круга. */
  hops: number;
  /** Встреча — одна за действие: проигравший, отступив, мог бы встать на
   *  чужую клетку и начать следующую, и так без конца. */
  dueled: boolean;
};

const newCtx = (room: Room, mover: Seat | null): Ctx => ({
  room,
  fx: [],
  notes: [],
  mover,
  again: false,
  hops: 0,
  dueled: false,
});

/** Сколько клеток можно разобрать за одно действие. Стрелка на стрелку, что
 *  ведёт обратно, или Скиннер с отбросом на стрелку к нему же гоняли бы
 *  фишку без конца. */
const HOPS_MAX = 8;

function grantSkill(seat: Seat, skill: BoardSkill, notes: string[]): boolean {
  const name = BOARD_SKILLS[skill].name;
  if (seat.skills.length < BOARD_HAND_MAX) {
    seat.skills.push(skill);
    notes.push(`${seat.name}: навык получен — ${name}`);
    return true;
  }
  notes.push(
    `${seat.name}: ${name} — но в руке уже ${BOARD_HAND_MAX} навыка, этот пропал`,
  );
  return false;
}

/** Отбросить назад — если не спасёт [Чутьё опасности]. На новой клетке
 *  срабатывает всё, что там есть. */
function throwBack(ctx: Ctx, seat: Seat, by: number, why: string) {
  if (useShield(seat)) {
    ctx.notes.push(
      `${seat.name}: ${why}, но ${BOARD_SKILLS.danger.name} спасает`,
    );
    return;
  }
  const from = seat.pos;
  seat.pos = Math.max(0, seat.pos - by);
  ctx.fx.push({ kind: "push", slot: seat.slot, to: seat.pos });
  ctx.notes.push(`${seat.name}: ${why} — назад на ${by}`);
  if (armyOvertakes(ctx, seat, from)) return;
  landOn(ctx, seat, false);
}

/** Отступил назад мимо армии Гоблинов — значит, она его обогнала, и он
 *  отлетает ещё на 3. true — отбросила, и новую клетку уже разобрал
 *  throwBack; false — армию не задел или спасло [Чутьё опасности]. */
function armyOvertakes(ctx: Ctx, seat: Seat, from: number): boolean {
  const { room } = ctx;
  const passed = room.map.hunters.some((def, i) => {
    const at = room.hunters[i]!.at;
    return def.kind === "army" && at !== null && from > at && seat.pos < at;
  });
  // На старте отбрасывать уже некуда.
  if (!passed || seat.pos === 0) return false;
  const before = seat.pos;
  throwBack(ctx, seat, HUNTER_THROW, "армия Гоблинов обгоняет");
  return seat.pos !== before;
}

/**
 * Фишка встала на клетку — чем бы ни привело: кубиком, стрелкой, встречей,
 * дракой или охотником. Срабатывает всё, что на клетке есть, одинаково:
 * пропуск хода, ещё бросок, навык, охотник, встреча, стрелка — а после
 * стрелки то же самое на клетке, куда она привела.
 *
 * byDice — сюда пришли по кубику: первую стрелку тогда видно по клетке у
 * кубика, и строчкой её не дублируем.
 */
function landOn(ctx: Ctx, seat: Seat, byDice: boolean) {
  const { room, notes } = ctx;
  const last = boardLast(room.map);
  const seen = new Set<number>();

  while (seat.pos < last && ctx.hops < HOPS_MAX) {
    ctx.hops++;
    const at = seat.pos;
    seen.add(at);
    const cell = room.map.cells[at]!;

    if (cell.effect.kind === "skip") {
      seat.skip++;
      notes.push(`${seat.name} пропустит следующий ход`);
    } else if (cell.effect.kind === "again") {
      if (seat === ctx.mover) {
        ctx.again = true;
        notes.push(`${seat.name} бросает ещё раз`);
      } else {
        seat.bonus++;
        notes.push(`${seat.name}: ещё бросок — в свой ход`);
      }
    }

    // Навык с этой же клетки от её красной стрелки не спасает: иначе клетка
    // со стрелкой назад и [Чутьё опасности] выдавала бы навык и тут же его
    // сжигала, а фишка оставалась на месте. Спасает только навык, что был в
    // руке до того, как встал сюда; полученный — на будущее.
    const fresh = cell.skill === "danger" && grantSkill(seat, "danger", notes);
    if (cell.skill && cell.skill !== "danger")
      grantSkill(seat, cell.skill, notes);

    // Пришёл на клетку охотника — сам к нему пришёл.
    for (const [i, h] of room.hunters.entries()) {
      if (h.at !== at) continue;
      meetHunter(ctx, i, seat);
      if (seat.pos !== at) return;
    }

    if (!ctx.dueled && at > 0) {
      const other = activeSeats(room).find((s) => s !== seat && s.pos === at);
      if (other) {
        duel(ctx, seat, other);
        if (seat.pos !== at) return;
      }
    }

    const to = jumpTarget(room.map, at);
    if (to === null || seen.has(to)) return;
    const shields =
      seat.skills.filter((s) => s === "danger").length - (fresh ? 1 : 0);
    if (to < at && shields > 0 && useShield(seat)) {
      notes.push(
        `${seat.name}: ${BOARD_SKILLS.danger.name} — красная стрелка не страшна`,
      );
      return;
    }
    if (!byDice || seen.size > 1)
      notes.push(
        `${seat.name}: по стрелке ${to ? `на клетку ${to}` : "на старт"}`,
      );
    seat.pos = to;
    ctx.fx.push({ kind: "jump", slot: seat.slot, to });
    if (to < at && armyOvertakes(ctx, seat, at)) return;
  }
}

/** Охотник и игрок на одной клетке — что бы ни свело их вместе: игрок
 *  пришёл или охотник дошёл. У каждого охотника своё. */
function meetHunter(ctx: Ctx, index: number, seat: Seat) {
  const def = ctx.room.map.hunters[index]!;
  if (def.kind === "fae") return faePrank(ctx, seat);
  if (def.kind === "toren") return torenRobs(ctx, seat);
  throwBack(
    ctx,
    seat,
    HUNTER_THROW,
    def.kind === "army" ? "под ноги армии Гоблинов" : "встреча со Скиннером",
  );
}

/** Торен обирает пойманного: [Чутьё опасности] спасает, а нет его —
 *  забирает любую карточку. С пустыми руками — отбрасывает. */
function torenRobs(ctx: Ctx, seat: Seat) {
  if (useShield(seat)) {
    ctx.notes.push(
      `${seat.name}: Торен тянется к поясу, но ${BOARD_SKILLS.danger.name} спасает`,
    );
    return;
  }
  if (seat.skills.length) {
    const [stolen] = seat.skills.splice(randomInt(seat.skills.length), 1);
    ctx.notes.push(`${seat.name}: Торен крадёт ${BOARD_SKILLS[stolen!].name}`);
    return;
  }
  throwBack(ctx, seat, HUNTER_THROW, "Торену нечего украсть, и он бьёт мечом");
}

/** Феи: подарок, цветы вместо навыка или лавина — как повезёт. */
function faePrank(ctx: Ctx, seat: Seat) {
  // Каждая проказа — и строчкой в журнал, и плашкой поверх карты: журнал под
  // картой во время хода никто не читает.
  const prank = (text: string, good: boolean) => {
    ctx.notes.push(`${seat.name}: ${text}`);
    ctx.fx.push({ kind: "prank", slot: seat.slot, text, good });
  };
  const roll = randomInt(3);
  if (roll === 0) {
    const pool = ctx.room.map.skills;
    const gift = pool[randomInt(pool.length)]!;
    const name = BOARD_SKILLS[gift].name;
    // Что получилось с подарком, журналу допишет grantSkill.
    ctx.notes.push(`${seat.name}: феям весело — они дарят навык`);
    ctx.fx.push(
      seat.skills.length < BOARD_HAND_MAX
        ? {
            kind: "prank",
            slot: seat.slot,
            text: `феям весело — они дарят ${name}`,
            good: true,
          }
        : {
            kind: "prank",
            slot: seat.slot,
            text: `феи дарят ${name}, но в руке уже ${BOARD_HAND_MAX} навыка — подарок тает`,
            good: false,
          },
    );
    grantSkill(seat, gift, ctx.notes);
  } else if (roll === 1) {
    if (!seat.skills.length) {
      prank("феи ищут, что бы превратить в цветы, — но в руке пусто", true);
      return;
    }
    const [gone] = seat.skills.splice(randomInt(seat.skills.length), 1);
    prank(`феи превращают ${BOARD_SKILLS[gone!].name} в увядшие цветы`, false);
  } else if (useShield(seat)) {
    prank(
      `феи сбрасывают лавину, но ${BOARD_SKILLS.danger.name} спасает`,
      true,
    );
  } else {
    seat.skip++;
    prank("феи сбрасывают лавину — пропустит следующий ход", false);
  }
}

/** Охотники выходят, когда кто-то из игроков забрался достаточно далеко. */
function wakeHunters(ctx: Ctx) {
  const { room } = ctx;
  const far = Math.max(0, ...activeSeats(room).map((s) => s.pos));
  for (const [i, def] of room.map.hunters.entries()) {
    const h = room.hunters[i]!;
    if (h.at !== null || far < def.wakesAt) continue;
    h.at = def.start;
    ctx.fx.push({ kind: "hunter", hunter: i, to: h.at });
    ctx.notes.push(def.wakeNote);
  }
}

/** Круг замкнулся — каждый вышедший охотник делает свой ход. */
function moveHunters(ctx: Ctx) {
  const { room } = ctx;
  if (room.status !== "playing") return;
  for (const [i, def] of room.map.hunters.entries()) {
    const h = room.hunters[i]!;
    if (h.at === null) continue;
    if (def.kind === "army") {
      marchArmy(ctx, i);
      continue;
    }

    const [lo, hi] = def.zone;
    const prey = activeSeats(room).filter((s) => s.pos >= lo && s.pos <= hi);
    // Охотиться не на кого — стоит, где стоял.
    if (!prey.length) continue;

    const from = h.at;
    let to: number;
    if (def.kind === "fae") {
      // Феи садятся то к кому-нибудь, то просто так — угадать нельзя.
      to =
        randomInt(2) === 0
          ? prey[randomInt(prey.length)]!.pos
          : randomInt(lo, hi + 1);
    } else {
      // Скиннер и Торен бросают свой кубик и проходят ровно столько к
      // ближайшему игроку — вперёд или назад. Могут и проскочить: ловят,
      // только если закончили ход на клетке игрока. Останавливайся они
      // ровно на жертве, увернуться было бы нельзя — будто угадывали ход.
      const target = prey.reduce((a, b) =>
        Math.abs(b.pos - from) < Math.abs(a.pos - from) ? b : a,
      );
      const dir = Math.sign(target.pos - from) || 1;
      const step = randomInt(HUNTER_STEP_MIN, HUNTER_STEP_MAX + 1);
      to = Math.min(Math.max(from + dir * step, lo), hi);
    }

    if (to !== from) {
      h.at = to;
      ctx.fx.push({ kind: "hunter", hunter: i, to });
    }
    for (const seat of activeSeats(room))
      if (seat.pos === to) meetHunter(ctx, i, seat);
  }
}

/** Армия Гоблинов ни за кем не гонится и никогда не идёт назад: каждый круг
 *  марширует ровно на ARMY_STEP клеток вперёд — есть кто на её участке или
 *  нет — и отбрасывает всех, кого обогнала или на чью клетку встала. Дошла
 *  до конца участка — на следующем круге уходит с карты и снова выступает со
 *  своей начальной клетки. */
function marchArmy(ctx: Ctx, index: number) {
  const { room } = ctx;
  const def = room.map.hunters[index]!;
  const h = room.hunters[index]!;
  const from = h.at!;

  if (from >= def.zone[1]) {
    h.at = def.start;
    ctx.fx.push({ kind: "hunter", hunter: index, to: null });
    ctx.fx.push({ kind: "hunter", hunter: index, to: h.at });
    ctx.notes.push(`${def.name} снова выступает в поход — с клетки ${h.at}`);
    for (const seat of activeSeats(room))
      if (seat.pos === h.at) meetHunter(ctx, index, seat);
    return;
  }

  const to = Math.min(from + ARMY_STEP, def.zone[1]);
  // Кого обогнала — решаем до отбросов: отброшенный не должен попасть под
  // армию второй раз.
  const passed = activeSeats(room).filter((s) => s.pos > from && s.pos <= to);
  h.at = to;
  ctx.fx.push({ kind: "hunter", hunter: index, to });
  for (const seat of passed)
    throwBack(ctx, seat, HUNTER_THROW, "армия Гоблинов обгоняет");
}

/** Встали на одну клетку: оба бросают, меньший отступает. На старте не
 *  встречаются — там места хватит всем. */
function duel(ctx: Ctx, seat: Seat, other: Seat) {
  ctx.dueled = true;
  let mine = 0;
  let theirs = 0;
  // Ничью перебрасывают: иначе встреча слишком часто кончалась бы ничем.
  while (mine === theirs) {
    mine = randomInt(1, 7);
    theirs = randomInt(1, 7);
  }
  const [winner, loser] = mine > theirs ? [seat, other] : [other, seat];
  ctx.fx.push({
    kind: "duel",
    a: seat.slot,
    b: other.slot,
    va: mine,
    vb: theirs,
  });
  ctx.notes.push(
    `Встреча на клетке: ${seat.name} — ${mine}, ${other.name} — ${theirs}`,
  );
  throwBack(
    ctx,
    loser,
    DUEL_THROW,
    `проигрыш во встрече с игроком ${winner.name}`,
  );
}

/** Кто дошёл до финиша. По стрелке вперёд туда может занести и не того, чей
 *  ход, — тогда побеждает он. Если дошли двое, первым считается ходивший. */
function finisher(ctx: Ctx): Seat | null {
  const done = activeSeats(ctx.room).filter(
    (s) => s.pos >= boardLast(ctx.room.map),
  );
  return done.find((s) => s === ctx.mover) ?? done[0] ?? null;
}

/** Закончить действие: победа, следующий ход или ещё бросок того же игрока. */
function finishAction(
  ctx: Ctx,
  slot: number,
  landed: number | null,
  auto: boolean,
) {
  const { room, notes } = ctx;
  const won = finisher(ctx);
  if (won) {
    room.status = "finished";
    room.winnerSlot = won.slot;
    room.wins.set(won.userId, (room.wins.get(won.userId) ?? 0) + 1);
    room.games++;
    room.choice = null;
    try {
      onFinished?.(room.seats.every((s) => s.admin));
    } catch {}
    notes.push(`${won.name} доходит до финиша и побеждает!`);
  } else if (ctx.again) {
    room.skillUsed = false;
    room.turnSince = Date.now();
  } else if (landed !== null) {
    nextTurn(room, ctx);
  }

  for (const note of notes) log(room, note);
  room.lastAction = { id: ++room.seq, slot, landed, fx: ctx.fx, notes, auto };
  pushState(room);
}

/** Бросок. Двумя кубиками ([Безупречный бросок]) — сперва выбор, на какой
 *  идти: больший не всегда лучше. За того, кто не на связи, стол берёт больший. */
function roll(room: Room, seat: Seat, auto: boolean) {
  const values = [randomInt(1, 7)];
  if (seat.doubleNext) values.push(randomInt(1, 7));
  seat.doubleNext = false;

  if (values.length > 1 && !auto) {
    room.choice = values;
    const note = `${seat.name}: выпало ${values[0]} и ${values[1]} — выбирает, на сколько идти`;
    log(room, note);
    room.lastAction = {
      id: ++room.seq,
      slot: seat.slot,
      landed: null,
      fx: [{ kind: "dice", values }],
      notes: [note],
      auto,
    };
    room.turnSince = Date.now();
    pushState(room);
    return;
  }

  move(room, seat, Math.max(...values), values, auto);
}

/** Пройти выпавшее и разобрать, куда пришли. shownDice — показать кубик:
 *  после выбора из двух кубики уже на экране. */
function move(
  room: Room,
  seat: Seat,
  dice: number,
  shownDice: number[] | null,
  auto: boolean,
) {
  const ctx = newCtx(room, seat);
  if (shownDice) ctx.fx.push({ kind: "dice", values: shownDice });

  // [Чудесное угощение] прибавляет шаги к любому броску — и к выбранному из двух.
  const fare = seat.fareNext ? FARE_BONUS : 0;
  seat.fareNext = false;
  const walk = dice + fare;

  const last = boardLast(room.map);
  const from = seat.pos;
  const steps: number[] = [];
  for (let i = 1; i <= walk && from + i <= last; i++) steps.push(from + i);
  seat.pos = steps.at(-1) ?? from;
  ctx.fx.push({ kind: "walk", slot: seat.slot, cells: steps });

  const landedAt = seat.pos;
  const landed = room.map.cells[landedAt]!;
  const who = auto
    ? `${seat.name} (не на связи, кубик бросил стол)`
    : seat.name;
  const effect = effectLabel(landed.effect);
  log(
    room,
    `${who}: ${fare ? `${dice} + ${fare}` : dice} — ${landed.text}${effect ? ` · ${effect}` : ""}`,
  );

  landOn(ctx, seat, true);
  wakeHunters(ctx);

  // «Ещё бросок», заработанный в чужой ход, — сейчас, после своего.
  if (!ctx.again && seat.bonus > 0 && seat.pos < last) {
    seat.bonus--;
    ctx.again = true;
    ctx.notes.push(`${seat.name} бросает ещё раз — бросок из запаса`);
  }

  finishAction(ctx, seat.slot, landedAt, auto);
}

export function chooseDice(peer: any, index: unknown) {
  const p = peerSeat(peer);
  if (!p) return;
  const { room, seat } = p;
  if (room.status !== "playing" || !room.choice) return;
  if (room.seats[room.turn] !== seat) return fail(peer, "Сейчас не твой ход");
  if (index !== 0 && index !== 1) return;
  const dice = room.choice[index]!;
  room.choice = null;
  move(room, seat, dice, null, false);
}

export function playSkill(peer: any, skill: unknown, target: unknown) {
  const p = peerSeat(peer);
  if (!p) return;
  const { room, seat } = p;
  if (room.status !== "playing") return;
  if (room.seats[room.turn] !== seat)
    return fail(peer, "Навык можно сыграть только в свой ход");
  if (room.choice) return fail(peer, "Сначала выбери кубик");
  if (room.skillUsed) return fail(peer, "Один навык за ход");
  // [Чутьё опасности] не играют — оно срабатывает само.
  if (!isBoardSkill(skill) || skill === "danger") return;
  const at = seat.skills.indexOf(skill);
  if (at < 0) return fail(peer, "Такого навыка у тебя нет");

  // Навыки на соперника — [Трактирная драка] и [Удар минотавра] — с целью.
  const strike = BOARD_STRIKES[skill];
  const victim = strike
    ? activeSeats(room).find((s) => s.slot === target && s !== seat)
    : null;
  if (strike && !victim) return fail(peer, "Выбери, с кем драться");
  if (skill === "fare" && seat.fareNext) return;

  seat.skills.splice(at, 1);
  room.skillUsed = true;
  const ctx = newCtx(room, seat);

  if (skill === "double") {
    seat.doubleNext = true;
    ctx.notes.push(
      `${seat.name} играет ${BOARD_SKILLS.double.name}: бросит два кубика и выберет`,
    );
  } else if (skill === "fare") {
    seat.fareNext = true;
    ctx.notes.push(
      `${seat.name} играет ${BOARD_SKILLS.fare.name}: к броску прибавится ${FARE_BONUS}`,
    );
  } else {
    ctx.notes.push(
      `${seat.name} играет ${BOARD_SKILLS[skill].name} против игрока ${victim!.name}`,
    );
    throwBack(
      ctx,
      victim!,
      strike!,
      skill === "minotaur" ? "[Удар минотавра]" : "удар в трактирной драке",
    );
  }

  // Ход после навыка не переходит: бросок ещё впереди.
  ctx.again = true;
  finishAction(ctx, seat.slot, null, false);
}

export function rollDice(peer: any) {
  const p = peerSeat(peer);
  if (!p) return;
  const { room, seat } = p;
  if (room.status !== "playing") return;
  if (room.seats[room.turn] !== seat) return fail(peer, "Сейчас не твой ход");
  if (room.choice) return fail(peer, "Сначала выбери кубик");
  roll(room, seat, false);
}

export function postChat(peer: any, raw: unknown) {
  const p = peerSeat(peer);
  if (!p || typeof raw !== "string") return;
  const { room, seat } = p;

  const text = raw.replace(/\s+/g, " ").trim().slice(0, BOARD_CHAT_MAX);
  if (!text) return;

  const now = Date.now();
  if (now - (lastChatAt.get(seat.userId) ?? 0) < CHAT_GAP_MS) return;
  lastChatAt.set(seat.userId, now);

  const message: BoardChatMessage = {
    id: ++room.seq,
    slot: seat.slot,
    name: seat.name,
    text,
    at: now,
  };
  room.chat.push(message);
  if (room.chat.length > CHAT_KEEP)
    room.chat.splice(0, room.chat.length - CHAT_KEEP);
  broadcast(room, { type: "chat", message });
}

/** Встать из-за стола насовсем. В лобби место освобождается, в партии фишка
 *  остаётся на карте, но ход её пропускается. */
/** Ещё партия за тем же столом. Стол возвращается в ожидание: те, кто
 *  ушёл, освобождают места, остальные — снова на старте, без навыков, и
 *  Скиннер снова в руинах. Чат остаётся — это разговор за тем же столом. */
export function rematch(peer: any) {
  const p = peerSeat(peer);
  if (!p) return;
  const { room, seat } = p;
  if (room.status !== "finished") return;

  // Новую партию начинает следующий по кругу. Пропал со связи — может любой,
  // иначе стол так и стоял бы.
  const next = nextHost(room);
  if (next && next !== seat && isOnline(room, next.userId)) {
    return fail(peer, `Новую партию начинает ${next.name}`);
  }
  room.hostUserId = (next ?? seat).userId;
  room.seats = room.seats.filter((s) => !s.left);

  for (const s of room.seats) {
    s.pos = 0;
    s.skip = 0;
    s.skills = [];
    s.doubleNext = false;
    s.fareNext = false;
    s.bonus = 0;
  }
  room.choice = null;
  room.status = "lobby";
  room.turn = 0;
  room.winnerSlot = null;
  room.hunters = freshHunters(room.map);
  room.lastAction = null;
  room.skillUsed = false;
  room.log = [];
  log(room, `${seat.name} накрывает стол для новой партии`);
  pushState(room);
  nudgeOpenTables();
}

/** Следующий по кругу после того, кто начинал партию, — из тех, кто ещё за столом. */
function nextHost(room: Room): Seat | null {
  const stay = room.seats.filter((s) => !s.left);
  if (!stay.length) return null;
  const at = room.seats.findIndex((s) => s.userId === room.hostUserId);
  for (let k = 1; k <= room.seats.length; k++) {
    const s = room.seats[(Math.max(at, 0) + k) % room.seats.length]!;
    if (!s.left) return s;
  }
  return stay[0]!;
}

export function leaveRoom(peer: any) {
  const p = peerSeat(peer);
  if (!p) return;
  const { room, seat } = p;

  for (const [other, userId] of room.peers)
    if (userId === seat.userId) room.peers.delete(other);

  if (room.status === "lobby") {
    room.seats = room.seats.filter((s) => s !== seat);
    log(room, `${seat.name} встаёт из-за стола`);
    if (seat.userId === room.hostUserId && room.seats[0])
      room.hostUserId = room.seats[0].userId;
  } else if (room.status === "playing") {
    seat.left = true;
    log(room, `${seat.name} уходит из партии`);
    const active = room.seats.filter((s) => !s.left);
    if (!active.length) {
      room.status = "finished";
    } else if (room.seats[room.turn] === seat) {
      room.choice = null;
      const ctx = newCtx(room, null);
      nextTurn(room, ctx);
      for (const note of ctx.notes) log(room, note);
    }
    if (seat.userId === room.hostUserId && active[0])
      room.hostUserId = active[0].userId;
  }

  if (!room.seats.length) {
    rooms.delete(room.code);
    nudgeOpenTables();
    return;
  }
  pushState(room);
  nudgeOpenTables();
  // Уход — заметно всем, а не только строчкой в журнале.
  broadcast(room, { type: "event", text: `${seat.name} больше не за столом` });
}

/** Соединение закрылось — вкладку закрыли или пропала связь. Место за
 *  столом остаётся: человек может вернуться. */
export function dropPeer(peer: any) {
  for (const room of rooms.values()) {
    if (!room.peers.delete(peer)) continue;
    room.touchedAt = Date.now();
    pushState(room);
    if (!room.peers.size) nudgeOpenTables();
  }
}

/** Раз в несколько секунд: бросок за пропавшего игрока и уборка пустых комнат. */
function tick() {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.peers.size) room.touchedAt = now;
    else if (now - room.touchedAt > EMPTY_ROOM_MS) {
      rooms.delete(room.code);
      nudgeOpenTables();
      continue;
    }

    // Без людей партия не идёт: иначе брошенный стол доигрывал бы сам с собой
    // и попадал в статистику доигранных.
    if (room.status !== "playing" || !room.peers.size) continue;
    const seat = room.seats[room.turn];
    if (
      seat &&
      !isOnline(room, seat.userId) &&
      now - room.turnSince > OFFLINE_TURN_MS
    ) {
      // Пропал, не выбрав кубик, — стол берёт больший.
      if (room.choice) {
        const dice = Math.max(...room.choice);
        room.choice = null;
        move(room, seat, dice, null, true);
      } else {
        roll(room, seat, true);
      }
    }
  }
}

const g = globalThis as { __boardTick?: ReturnType<typeof setInterval> };
if (!g.__boardTick) {
  g.__boardTick = setInterval(tick, 5000);
  g.__boardTick.unref?.();
}
