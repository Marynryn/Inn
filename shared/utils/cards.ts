/**
 * Карточная игра «Таверна»: по три героя с каждой стороны, кубики стихий,
 * реакции и карты действий. Партия идёт целиком в браузере против компьютера,
 * поэтому здесь и правила, и ход компьютера. Движок не знает про страницу:
 * состояние — простой объект, ход — cardsApply(state, side, action).
 *
 * Имена героев — по глоссарию перевода (server/assets/game/glossary.json).
 */

export type Element = 'fire' | 'ice' | 'magic' | 'wind' | 'poison' | 'steel'
export type Die = Element | 'omni'
export type Side = 0 | 1

/** symbol — значок на кубике: первые буквы у Льда и «Любого» совпадают. */
export const CARD_ELEMENTS: Record<Element, { name: string; color: string; symbol: string }> = {
  fire: { name: 'Огонь', color: '#e0804a', symbol: '🔥' },
  ice: { name: 'Лёд', color: '#8fc6e8', symbol: '❄' },
  magic: { name: 'Магия', color: '#b48ae0', symbol: '✦' },
  wind: { name: 'Ветер', color: '#7ad6b8', symbol: '༄' },
  poison: { name: 'Яд', color: '#9cc25a', symbol: '☣' },
  steel: { name: 'Сталь', color: '#b9b2a6', symbol: '⚔' },
}
export const CARD_OMNI = { name: 'Любой', color: '#c9a02e', symbol: '★' }

const dieInfo = (d: Die) => (d === 'omni' ? CARD_OMNI : CARD_ELEMENTS[d])
export const dieName = (d: Die) => dieInfo(d).name
export const dieColor = (d: Die) => dieInfo(d).color
export const dieSymbol = (d: Die) => dieInfo(d).symbol

/** Цена: el — кубики стихии героя (или «любые»), any — какие угодно. */
export type Cost = { el?: number; any?: number }

export type HeroId = 'erin' | 'ceria' | 'pisces' | 'ryoka' | 'relc' | 'rags'
type Move = { name: string; text: string }

export const CARD_HEROES: Record<HeroId, {
  name: string
  el: Element
  hp: number
  energy: number
  role: string
  attack: Move
  skill: Move
  burst: Move
}> = {
  erin: {
    name: 'Эрин', el: 'fire', hp: 10, energy: 2, role: 'Поддержка',
    attack: { name: 'Сковорода', text: '2 урона Сталью' },
    skill: { name: 'Горячий обед', text: '2 урона Огнём, все свои лечатся на 1' },
    burst: { name: 'Пир в таверне', text: 'Все свои лечатся на 2 и бьют следующим ударом на 1 сильнее' },
  },
  ceria: {
    name: 'Сирия', el: 'ice', hp: 10, energy: 3, role: 'Маг льда',
    attack: { name: 'Ледяной осколок', text: '2 урона Льдом' },
    skill: { name: 'Ледяное копьё', text: '3 урона Льдом' },
    burst: { name: 'Ледяная буря', text: '4 урона Льдом, цель замерзает до конца раунда' },
  },
  pisces: {
    name: 'Пишес', el: 'magic', hp: 10, energy: 3, role: 'Маг',
    attack: { name: 'Рапира', text: '2 урона Сталью' },
    skill: { name: 'Магическая стрела', text: '3 урона Магией' },
    burst: { name: 'Призыв скелета', text: '2 урона Магией; скелет 3 раунда бьёт на 1 Магией в конце раунда' },
  },
  ryoka: {
    name: 'Рёка', el: 'wind', hp: 10, energy: 2, role: 'Бегунья',
    attack: { name: 'Удар ногой', text: '2 урона Сталью' },
    skill: { name: 'Порыв ветра', text: '2 урона Ветром, враг меняет героя на следующего' },
    burst: { name: 'Ураган', text: '2 урона Ветром каждому врагу' },
  },
  relc: {
    name: 'Релк', el: 'steel', hp: 12, energy: 2, role: 'Стражник',
    attack: { name: 'Выпад', text: '2 урона Сталью' },
    skill: { name: 'Удар копьём', text: '4 урона Сталью' },
    burst: { name: 'Сержант стражи', text: '3 урона Сталью и щит на 3 себе' },
  },
  rags: {
    name: 'Рэгс', el: 'poison', hp: 10, energy: 3, role: 'Вождь гоблинов',
    attack: { name: 'Арбалет', text: '2 урона Сталью' },
    skill: { name: 'Отравленная ловушка', text: '2 урона Ядом, цель отравлена на 2 раунда' },
    burst: { name: 'Гоблинская засада', text: '2 урона Ядом каждому врагу' },
  },
}
export const CARD_HERO_IDS = Object.keys(CARD_HEROES) as HeroId[]

export const ATTACK_COST: Cost = { el: 1, any: 1 }
export const SKILL_COST: Cost = { el: 3 }
export const BURST_COST: Cost = { el: 3 }
export const SWITCH_COST: Cost = { any: 1 }

export type CardId = 'pizza' | 'juice' | 'flies' | 'potion' | 'scroll' | 'chess' | 'night' | 'mrsha' | 'shield' | 'rumors'

export const CARDS: Record<CardId, { name: string; kind: string; cost: number; text: string }> = {
  pizza: { name: 'Пицца', kind: 'Еда', cost: 1, text: 'Активный герой лечится на 3' },
  juice: { name: 'Синий фруктовый сок', kind: 'Еда', cost: 1, text: 'Активный герой получает 1 энергию' },
  flies: { name: 'Кислотные мухи', kind: 'Еда', cost: 1, text: 'Следующий удар активного героя на 2 сильнее' },
  potion: { name: 'Лечебное зелье', kind: 'Предмет', cost: 0, text: 'Самый раненый свой герой лечится на 2' },
  scroll: { name: 'Свиток огненного шара', kind: 'Предмет', cost: 2, text: '2 урона Огнём активному врагу' },
  shield: { name: 'Щит стражника', kind: 'Предмет', cost: 1, text: 'Активный герой получает щит на 2' },
  chess: { name: 'Шахматная партия', kind: 'Событие', cost: 0, text: 'Перебросить кубики ещё раз' },
  night: { name: 'Ночлег в таверне', kind: 'Событие', cost: 2, text: 'Все свои лечатся на 1, яд снимается' },
  mrsha: { name: 'Подарок Мрши', kind: 'Событие', cost: 0, text: 'Получить 1 кубик «Любой»' },
  rumors: { name: 'Свежие слухи', kind: 'Событие', cost: 1, text: 'Взять 2 карты' },
}
export const CARD_IDS = Object.keys(CARDS) as CardId[]

export const DICE_PER_ROUND = 8
export const HAND_START = 5
export const HAND_MAX = 10
export const DRAW_PER_ROUND = 2

export type Fighter = {
  id: HeroId
  hp: number
  energy: number
  aura: Element | null // метка стихии, с которой реагирует следующий удар
  shield: number
  bonus: number // прибавка к следующему удару
  poison: number // сколько раундов ещё тикает яд
  frozen: boolean
}

export type Player = {
  fighters: Fighter[]
  active: number
  dice: Die[]
  hand: CardId[]
  deck: CardId[]
  ended: boolean
  rerolls: number
  rolling: boolean // ещё не решил, что перебросить: пока кто-то решает, ходов нет
  skeleton: number // сколько раундов ещё бьёт скелет Пишеса
}

export type Phase = 'reroll' | 'action' | 'over'

/** Что случилось с героем за последний ход: страница показывает это всплывающими цифрами. */
export type Fx = { side: Side; idx: number; text: string; kind: 'dmg' | 'heal' | 'shield' | 'note' }

export type Game = {
  /** С компьютером — партия в браузере; online — на сервере, двое людей. */
  vs: 'computer' | 'online'
  /** Как звать стороны в журнале. С компьютером — «Ты» и «Соперник». */
  names: [string, string]
  players: [Player, Player]
  round: number
  turn: Side
  first: Side // кто первым закончил прошлый раунд — тот начинает новый
  phase: Phase
  /** Чей активный герой пал и кто сейчас выбирает замену. */
  choosing: Side | null
  winner: Side | null
  log: string[]
  seed: number
  fx: Fx[]
  /** Только в виде для игрока: сколько карт у соперника — сами карты скрыты. */
  foeHand?: number
}

export type Action =
  | { type: 'reroll'; dice: number[] }
  | { type: 'attack' }
  | { type: 'skill' }
  | { type: 'burst' }
  | { type: 'switch'; to: number }
  | { type: 'choose'; to: number }
  | { type: 'play'; card: number }
  | { type: 'tune'; card: number; die: number }
  | { type: 'end' }

// ─── Случайность ───────────────────────────────────────────
// Своя, с зерном в состоянии: партию можно повторить в проверке.

function rand(g: Game) {
  g.seed = (g.seed + 0x6d2b79f5) | 0
  let t = g.seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function shuffle<T>(g: Game, arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(g) * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

/** Грани кубика — стихии своего отряда и «Любой»: чужие стихии бросать без толку. */
function rollDie(g: Game, p: Player): Die {
  const faces: Die[] = [...new Set(p.fighters.map(f => CARD_HEROES[f.id].el)), 'omni']
  return faces[Math.floor(rand(g) * faces.length)]!
}

// ─── Начало партии ─────────────────────────────────────────

function newPlayer(team: HeroId[]): Player {
  return {
    fighters: team.map(id => ({ id, hp: CARD_HEROES[id].hp, energy: 0, aura: null, shield: 0, bonus: 0, poison: 0, frozen: false })),
    active: 0,
    dice: [],
    hand: [],
    deck: CARD_IDS.flatMap(c => [c, c]),
    ended: false,
    rerolls: 1,
    rolling: true,
    skeleton: 0,
  }
}

export type CardsGameOptions = { vs?: Game['vs']; names?: [string, string]; first?: Side }

export function newCardsGame(mine: HeroId[], theirs: HeroId[], seed = Date.now(), opts: CardsGameOptions = {}): Game {
  const first = opts.first ?? 0
  const g: Game = {
    vs: opts.vs ?? 'computer',
    names: opts.names ?? ['Ты', 'Соперник'],
    players: [newPlayer(mine), newPlayer(theirs)],
    round: 1,
    turn: first,
    first,
    phase: 'reroll',
    choosing: null,
    winner: null,
    log: [],
    seed,
    fx: [],
  }
  for (const p of g.players) {
    shuffle(g, p.deck)
    draw(p, HAND_START)
    p.dice = Array.from({ length: DICE_PER_ROUND }, () => rollDie(g, p))
  }
  if (g.vs === 'computer') computerReroll(g)
  say(g, 'Раунд 1. Можно перебросить кубики.')
  return g
}

/** Компьютер случайного героя противнику: любые трое, кроме повторов внутри отряда. */
export function randomCardsTeam(seed = Date.now()): HeroId[] {
  const g = { seed } as Game
  return shuffle(g, [...CARD_HERO_IDS]).slice(0, 3)
}

function draw(p: Player, n: number) {
  for (let i = 0; i < n && p.deck.length; i++) {
    const c = p.deck.pop()!
    if (p.hand.length < HAND_MAX) p.hand.push(c)
  }
}

function pop(g: Game, f: Fighter, kind: Fx['kind'], text: string) {
  for (const side of [0, 1] as Side[]) {
    const idx = g.players[side].fighters.indexOf(f)
    if (idx >= 0) g.fx.push({ side, idx, kind, text })
  }
}

function say(g: Game, line: string) {
  g.log.push(line)
  if (g.log.length > 40) g.log.shift()
}

const who = (g: Game, side: Side) => g.names[side]
const heroName = (f: Fighter) => CARD_HEROES[f.id].name
/** В логе герой соперника помечен: отряды могут совпадать. По сети стороны
 *  зовут по именам, и помечаем только героя, который есть у обоих. */
function tag(g: Game, side: Side, f: Fighter) {
  if (g.vs === 'computer') return side === 1 ? `${heroName(f)} (соперник)` : heroName(f)
  const both = g.players.every(p => p.fighters.some(x => x.id === f.id))
  return both ? `${heroName(f)} (${g.names[side]})` : heroName(f)
}
export const cardsActive = (p: Player) => p.fighters[p.active]!
const alive = (f: Fighter) => f.hp > 0

// ─── Кубики ────────────────────────────────────────────────

/**
 * Какими кубиками платить. Под стихию сперва идут кубики этой стихии, потом
 * «Любые»; под «любые» — сперва чужие стихии, «Любые» напоследок. Не хватает —
 * null.
 */
export function cardsPayment(dice: Die[], cost: Cost, el: Element): number[] | null {
  const free = dice.map((d, i) => ({ d, i }))
  const take = (pred: (d: Die) => boolean, n: number, out: number[]) => {
    for (const x of free) {
      if (out.length >= n) break
      if (!out.includes(x.i) && pred(x.d)) out.push(x.i)
    }
  }
  const forEl: number[] = []
  take(d => d === el, cost.el ?? 0, forEl)
  take(d => d === 'omni', cost.el ?? 0, forEl)
  if (forEl.length < (cost.el ?? 0)) return null
  const rest = free.filter(x => !forEl.includes(x.i))
  const forAny: number[] = []
  const takeRest = (pred: (d: Die) => boolean) => {
    for (const x of rest) {
      if (forAny.length >= (cost.any ?? 0)) break
      if (!forAny.includes(x.i) && pred(x.d)) forAny.push(x.i)
    }
  }
  takeRest(d => d !== 'omni' && d !== el)
  takeRest(d => d !== 'omni')
  takeRest(() => true)
  if (forAny.length < (cost.any ?? 0)) return null
  return [...forEl, ...forAny]
}

function spend(p: Player, idx: number[]) {
  p.dice = p.dice.filter((_, i) => !idx.includes(i))
}

// ─── Урон и реакции ───────────────────────────────────────

type Hit = { side: Side; idx: number; amount: number; el: Element; swirl?: boolean }

function damage(g: Game, h: Hit) {
  const p = g.players[h.side]
  const f = p.fighters[h.idx]!
  if (!alive(f)) return
  let amount = h.amount
  const aura = f.aura
  const pair = (a: Element, b: Element) => (h.el === a && aura === b) || (h.el === b && aura === a)
  const others = () => p.fighters.map((_, i) => i).filter(i => i !== h.idx && alive(p.fighters[i]!))

  if (h.el === 'wind') {
    if (aura && aura !== 'wind' && aura !== 'steel' && !h.swirl) {
      say(g, `Рассеивание: ${CARD_ELEMENTS[aura].name} перекидывается на остальных`)
      pop(g, f, 'note', 'Рассеивание')
      f.aura = null
      for (const i of others()) damage(g, { side: h.side, idx: i, amount: 1, el: aura, swirl: true })
    }
  } else if (pair('fire', 'ice')) {
    amount += 2
    f.aura = null
    say(g, 'Таяние: +2 урона')
    pop(g, f, 'note', 'Таяние +2')
  } else if (pair('fire', 'poison')) {
    amount += 1
    f.aura = null
    say(g, 'Взрыв: +1 урон и по 1 всем остальным')
    pop(g, f, 'note', 'Взрыв +1')
    for (const i of others()) hurt(g, h.side, i, 1)
  } else if (pair('magic', 'poison')) {
    amount += 1
    f.aura = null
    f.shield = 0
    f.bonus = 0
    say(g, 'Нейтрализация: +1 урон, щиты и усиления сняты')
    pop(g, f, 'note', 'Нейтрализация +1')
  } else if (h.el !== 'steel') {
    f.aura = h.el
  }
  hurt(g, h.side, h.idx, amount)
}

/** Чистый урон: сперва в щит, потом в здоровье. */
function hurt(g: Game, side: Side, idx: number, amount: number) {
  const p = g.players[side]
  const f = p.fighters[idx]!
  if (!alive(f)) return
  const blocked = Math.min(f.shield, amount)
  f.shield -= blocked
  f.hp = Math.max(0, f.hp - (amount - blocked))
  if (blocked) pop(g, f, 'shield', `щит −${blocked}`)
  if (amount - blocked) pop(g, f, 'dmg', `−${amount - blocked}`)
  say(g, `${tag(g, side, f)} получает ${amount - blocked}${blocked ? ` (щит поглотил ${blocked})` : ''}`)
  if (!alive(f)) {
    Object.assign(f, { energy: 0, aura: null, shield: 0, bonus: 0, poison: 0, frozen: false })
    say(g, `${tag(g, side, f)} выбывает из боя`)
    if (p.fighters.every(x => !alive(x))) {
      g.phase = 'over'
      g.winner = (1 - side) as Side
      say(g, g.vs === 'online' ? `${g.names[(1 - side) as Side]} побеждает!` : side === 1 ? 'Победа!' : 'Поражение')
    } else if (idx === p.active) {
      g.choosing = side
    }
  }
}

function heal(g: Game, f: Fighter, n: number) {
  if (!alive(f)) return
  const was = f.hp
  f.hp = Math.min(CARD_HEROES[f.id].hp, f.hp + n)
  if (f.hp > was) pop(g, f, 'heal', `+${f.hp - was}`)
}

/** Удар героя: прибавка от еды и Пира срабатывает на первом же ударе. */
function strike(g: Game, side: Side, amount: number, el: Element) {
  const me = cardsActive(g.players[side])
  const foe = g.players[(1 - side) as Side]
  amount += me.bonus
  me.bonus = 0
  damage(g, { side: (1 - side) as Side, idx: foe.active, amount, el })
}

function forceSwitch(g: Game, side: Side) {
  const p = g.players[side]
  for (let k = 1; k < p.fighters.length; k++) {
    const i = (p.active + k) % p.fighters.length
    if (alive(p.fighters[i]!)) {
      p.active = i
      say(g, `${who(g, side)}: в бой выходит ${heroName(p.fighters[i]!)}`)
      return
    }
  }
}

// ─── Ходы ─────────────────────────────────────────────────

export type Check = { ok: true; pay: number[] } | { ok: false; why: string }

/** Можно ли сделать ход и чем за него платить: страница по этому гасит кнопки. */
export function cardsCheck(g: Game, side: Side, a: Action): Check {
  const p = g.players[side]
  const me = cardsActive(p)
  const el = CARD_HEROES[me.id].el
  const no = (why: string): Check => ({ ok: false, why })
  if (g.phase === 'over') return no('Партия окончена')
  if (g.choosing !== null) {
    if (g.choosing !== side || a.type !== 'choose') return no('Нужно выбрать героя')
    const f = p.fighters[a.to]
    return f && alive(f) ? { ok: true, pay: [] } : no('Этот герой не может выйти')
  }
  if (a.type === 'reroll') {
    return g.phase === 'reroll' && p.rolling ? { ok: true, pay: [] } : no('Сейчас не время')
  }
  if (g.phase !== 'action') return no(p.rolling ? 'Сначала кубики' : 'Соперник перебрасывает кубики')
  if (g.turn !== side) return no('Ход соперника')
  if (p.ended) return no('Ты уже закончил раунд')

  const pay = (cost: Cost): Check => {
    const idx = cardsPayment(p.dice, cost, el)
    return idx ? { ok: true, pay: idx } : no('Не хватает кубиков')
  }
  switch (a.type) {
    case 'attack':
    case 'skill':
    case 'burst':
      if (me.frozen) return no(`${heroName(me)} заморожен`)
      if (a.type === 'burst' && me.energy < CARD_HEROES[me.id].energy) return no('Не хватает энергии')
      return pay(a.type === 'attack' ? ATTACK_COST : a.type === 'skill' ? SKILL_COST : BURST_COST)
    case 'switch': {
      const f = p.fighters[a.to]
      if (!f || a.to === p.active || !alive(f)) return no('Этот герой не может выйти')
      return pay(SWITCH_COST)
    }
    case 'play': {
      const c = p.hand[a.card]
      if (!c) return no('Нет такой карты')
      if (c === 'potion' && !p.fighters.some(f => alive(f) && f.hp < CARD_HEROES[f.id].hp)) return no('Все здоровы')
      return pay({ any: CARDS[c].cost })
    }
    case 'tune': {
      const d = p.dice[a.die]
      if (!p.hand[a.card] || !d) return no('Нечего обменять')
      if (d === el || d === 'omni') return no('Этот кубик уже подходит')
      return { ok: true, pay: [] }
    }
    case 'end':
      return { ok: true, pay: [] }
    default:
      return no('Неизвестный ход')
  }
}

/** Сделать ход. Возвращает новое состояние; на недопустимый ход — то же самое. */
export function cardsApply(prev: Game, side: Side, a: Action): Game {
  const c = cardsCheck(prev, side, a)
  if (!c.ok) return prev
  const g: Game = structuredClone(prev)
  g.fx = []
  const p = g.players[side]
  const me = cardsActive(p)
  const foeSide = (1 - side) as Side
  spend(p, c.pay)
  let combat = false // боевой ход передаёт очередь сопернику, быстрый — нет

  switch (a.type) {
    case 'choose':
      p.active = a.to
      g.choosing = null
      say(g, `${who(g, side)}: в бой выходит ${heroName(cardsActive(p))}`)
      return g
    case 'reroll':
      for (const i of a.dice) if (p.dice[i]) p.dice[i] = rollDie(g, p)
      p.rerolls = Math.max(0, p.rerolls - 1)
      p.rolling = false
      if (!g.players.some(x => x.rolling)) g.phase = 'action'
      return g
    case 'attack': {
      const h = CARD_HEROES[me.id]
      say(g, `${tag(g, side, me)}: ${h.attack.name}`)
      if (me.id === 'ceria') strike(g, side, 2, 'ice')
      else strike(g, side, 2, 'steel')
      me.energy = Math.min(h.energy, me.energy + 1)
      combat = true
      break
    }
    case 'skill':
      skill(g, side)
      me.energy = Math.min(CARD_HEROES[me.id].energy, me.energy + 1)
      combat = true
      break
    case 'burst':
      me.energy = 0
      burst(g, side)
      combat = true
      break
    case 'switch':
      p.active = a.to
      say(g, `${who(g, side)}: в бой выходит ${heroName(cardsActive(p))}`)
      combat = true
      break
    case 'play':
      playCard(g, side, a.card)
      break
    case 'tune': {
      const card = p.hand.splice(a.card, 1)[0]!
      p.dice[a.die] = CARD_HEROES[me.id].el
      say(g, `${who(g, side)}: «${CARDS[card].name}» обменяна на кубик`)
      break
    }
    case 'end':
      p.ended = true
      say(g, `${who(g, side)}: раунд закончен`)
      if (!g.players[foeSide].ended) g.first = side
      combat = true
      break
  }

  if (g.phase === 'over') return g
  if (g.players[0].ended && g.players[1].ended) {
    endRound(g)
  } else if (combat && !g.players[foeSide].ended) {
    g.turn = foeSide
  }
  // Пал активный у компьютера — он выбирает сразу, не задерживая партию.
  if (g.choosing === 1 && g.vs === 'computer') computerChoose(g)
  return g
}

function skill(g: Game, side: Side) {
  const p = g.players[side]
  const me = cardsActive(p)
  const foe = (1 - side) as Side
  say(g, `${tag(g, side, me)}: ${CARD_HEROES[me.id].skill.name}`)
  switch (me.id) {
    case 'erin':
      strike(g, side, 2, 'fire')
      for (const f of p.fighters) heal(g, f, 1)
      break
    case 'ceria': strike(g, side, 3, 'ice'); break
    case 'pisces': strike(g, side, 3, 'magic'); break
    case 'ryoka':
      strike(g, side, 2, 'wind')
      if (g.phase !== 'over' && g.choosing !== foe) forceSwitch(g, foe)
      break
    case 'relc': strike(g, side, 4, 'steel'); break
    case 'rags': {
      const target = cardsActive(g.players[foe])
      strike(g, side, 2, 'poison')
      if (alive(target)) target.poison = 2
      break
    }
  }
}

function burst(g: Game, side: Side) {
  const p = g.players[side]
  const me = cardsActive(p)
  const foe = (1 - side) as Side
  const foes = g.players[foe]
  say(g, `${tag(g, side, me)}: ${CARD_HEROES[me.id].burst.name}!`)
  const everyone = (amount: number, el: Element) => {
    const first = foes.active
    for (let i = 0; i < foes.fighters.length; i++) {
      const idx = (first + i) % foes.fighters.length
      damage(g, { side: foe, idx, amount, el })
    }
  }
  switch (me.id) {
    case 'erin':
      for (const f of p.fighters) if (alive(f)) { heal(g, f, 2); f.bonus += 1 }
      break
    case 'ceria': {
      const target = cardsActive(foes)
      strike(g, side, 4, 'ice')
      if (alive(target)) target.frozen = true
      break
    }
    case 'pisces':
      strike(g, side, 2, 'magic')
      p.skeleton = 3
      break
    case 'ryoka': everyone(2, 'wind'); break
    case 'relc':
      strike(g, side, 3, 'steel')
      me.shield += 3
      pop(g, me, 'shield', 'щит +3')
      break
    case 'rags': everyone(2, 'poison'); break
  }
}

function playCard(g: Game, side: Side, idx: number) {
  const p = g.players[side]
  const me = cardsActive(p)
  const card = p.hand.splice(idx, 1)[0]!
  say(g, `${who(g, side)}: «${CARDS[card].name}»`)
  switch (card) {
    case 'pizza': heal(g, me, 3); break
    case 'juice': me.energy = Math.min(CARD_HEROES[me.id].energy, me.energy + 1); break
    case 'flies': me.bonus += 2; break
    case 'potion': {
      const hurtMost = p.fighters.filter(alive).sort((a, b) => (a.hp - CARD_HEROES[a.id].hp) - (b.hp - CARD_HEROES[b.id].hp))[0]
      if (hurtMost) heal(g, hurtMost, 2)
      break
    }
    case 'scroll': {
      const foe = g.players[(1 - side) as Side]
      damage(g, { side: (1 - side) as Side, idx: foe.active, amount: 2, el: 'fire' })
      break
    }
    case 'shield': me.shield += 2; pop(g, me, 'shield', 'щит +2'); break
    case 'chess':
      p.rerolls += 1
      if (g.vs === 'computer' && side === 1) computerReroll(g)
      else {
        p.rolling = true
        g.phase = 'reroll'
      }
      break
    case 'night':
      for (const f of p.fighters) { heal(g, f, 1); f.poison = 0 }
      break
    case 'mrsha': p.dice.push('omni'); break
    case 'rumors': draw(p, 2); break
  }
}

/** Конец раунда: скелет бьёт, яд тикает, лёд тает; потом раздача на новый. */
function endRound(g: Game) {
  for (const side of [0, 1] as Side[]) {
    const p = g.players[side]
    if (p.skeleton > 0 && g.phase !== 'over') {
      const foe = (1 - side) as Side
      say(g, g.vs === 'computer' ? `Скелет (${who(g, side).toLowerCase()}) бьёт` : `Скелет игрока ${who(g, side)} бьёт`)
      damage(g, { side: foe, idx: g.players[foe].active, amount: 1, el: 'magic' })
      p.skeleton--
    }
  }
  for (const side of [0, 1] as Side[]) {
    const p = g.players[side]
    p.fighters.forEach((f, i) => {
      if (f.poison > 0 && alive(f) && g.phase !== 'over') {
        f.poison--
        say(g, `Яд жжёт: ${tag(g, side, f)}`)
        damage(g, { side, idx: i, amount: 1, el: 'poison' })
      }
      f.frozen = false
    })
  }
  if (g.phase === 'over') return
  g.round++
  g.turn = g.first
  for (const p of g.players) {
    p.ended = false
    p.rerolls = 1
    p.rolling = true
    draw(p, DRAW_PER_ROUND)
    p.dice = Array.from({ length: DICE_PER_ROUND }, () => rollDie(g, p))
  }
  if (g.vs === 'computer') computerReroll(g)
  g.phase = 'reroll'
  say(g, `Раунд ${g.round}. Можно перебросить кубики.`)
}

// ─── По сети ──────────────────────────────────────────────

/** Игрок ушёл из партии — победа достаётся оставшемуся. */
export function cardsForfeit(prev: Game, side: Side): Game {
  if (prev.phase === 'over') return prev
  const g: Game = structuredClone(prev)
  g.fx = []
  g.phase = 'over'
  g.choosing = null
  g.winner = (1 - side) as Side
  say(g, `${who(g, side)} уходит из-за стола. ${who(g, g.winner)} побеждает!`)
  return g
}

const flip = (s: Side) => (1 - s) as Side

/**
 * Партия глазами игрока: он всегда снизу (сторона 0), карты соперника и
 * порядок колод скрыты, зерна случайности нет — по нему предсказали бы кубики.
 */
export function cardsView(g: Game, side: Side): Game {
  const v: Game = structuredClone(g)
  if (side === 1) {
    v.players.reverse()
    v.names.reverse()
    v.turn = flip(v.turn)
    v.first = flip(v.first)
    if (v.choosing !== null) v.choosing = flip(v.choosing)
    if (v.winner !== null) v.winner = flip(v.winner)
    v.fx = v.fx.map(x => ({ ...x, side: flip(x.side) }))
  }
  v.foeHand = v.players[1].hand.length
  v.players[1].hand = []
  for (const p of v.players) p.deck = []
  v.seed = 0
  return v
}

/** Ход пришёл по сети — проверяем форму, прежде чем отдать движку. */
export function isCardsAction(a: unknown): a is Action {
  if (!a || typeof a !== 'object') return false
  const x = a as Record<string, unknown>
  const int = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 64
  switch (x.type) {
    case 'attack': case 'skill': case 'burst': case 'end': return true
    case 'switch': case 'choose': return int(x.to)
    case 'play': return int(x.card)
    case 'tune': return int(x.card) && int(x.die)
    case 'reroll': return Array.isArray(x.dice) && x.dice.length <= 16 && x.dice.every(int)
    default: return false
  }
}

export const isHeroTeam = (v: unknown): v is HeroId[] =>
  Array.isArray(v) && v.length === 3 && new Set(v).size === 3 && v.every(id => CARD_HERO_IDS.includes(id))

/** Код стола карт: на букву длиннее кода настольной игры, чтобы их не путать. */
export const CARDS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CARDS_CODE_LENGTH = 6
export const isCardsCode = (v: unknown): v is string =>
  typeof v === 'string' && v.length === CARDS_CODE_LENGTH && [...v].every(c => CARDS_CODE_ALPHABET.includes(c))

/** Как стол выглядит для игрока. */
export type CardsSeatView = { name: string; avatarUrl: string | null; team: HeroId[] | null; online: boolean; rematch: boolean; wins: number }
export type CardsChatMessage = { id: number; side: Side; name: string; text: string; at: number }
/** games — сколько партий доиграно за этим столом: счёт показываем с первой. */
export type CardsRoomView = { code: string; you: Side; seats: CardsSeatView[]; game: Game | null; games: number; chat: CardsChatMessage[] }

export const CARDS_CHAT_MAX = 300

export type CardsClientMessage =
  | { type: 'join'; ticket: string; code: string }
  | { type: 'team'; team: HeroId[] }
  | { type: 'act'; action: Action }
  | { type: 'rematch' }
  | { type: 'chat'; text: string }
  | { type: 'leave' }

export type CardsServerMessage =
  | { type: 'room'; room: CardsRoomView }
  | { type: 'error'; message: string; fatal?: boolean }

// ─── Компьютер ────────────────────────────────────────────

/** Перебрасывает всё, что не подходит его активному герою. */
function computerReroll(g: Game) {
  const p = g.players[1]
  const el = CARD_HEROES[cardsActive(p).id].el
  while (p.rerolls > 0) {
    p.dice = p.dice.map(d => (d === el || d === 'omni' ? d : rollDie(g, p)))
    p.rerolls--
  }
  p.rolling = false
}

function computerChoose(g: Game) {
  const p = g.players[1]
  const best = p.fighters.map((f, i) => ({ f, i })).filter(x => alive(x.f)).sort((a, b) => b.f.hp - a.f.hp)[0]
  if (best) {
    p.active = best.i
    g.choosing = null
    say(g, `Соперник: в бой выходит ${heroName(best.f)}`)
  }
}

/**
 * Один ход компьютера. Жадный и простой: ульта, навык, полезные карты,
 * обычный удар; кубики, которыми не заплатить, меняет на карты; иначе пас.
 */
export function cardsComputerMove(g: Game): Action {
  const p = g.players[1]
  const me = cardsActive(p)
  const can = (a: Action) => cardsCheck(g, 1, a).ok
  const max = CARD_HEROES[me.id].hp

  if (me.frozen || (me.hp <= 3 && p.dice.length >= 4)) {
    const to = p.fighters.map((f, i) => ({ f, i })).filter(x => x.i !== p.active && alive(x.f)).sort((a, b) => b.f.hp - a.f.hp)[0]
    if (to && to.f.hp > me.hp && can({ type: 'switch', to: to.i })) return { type: 'switch', to: to.i }
  }
  if (can({ type: 'burst' })) return { type: 'burst' }

  const want = (c: CardId) => {
    switch (c) {
      case 'pizza': return me.hp <= max - 3
      case 'potion': return p.fighters.some(f => alive(f) && f.hp <= CARD_HEROES[f.id].hp - 2)
      case 'juice': return me.energy === CARD_HEROES[me.id].energy - 1
      case 'flies': return me.bonus === 0 && p.dice.length >= 4
      case 'scroll': return p.dice.length >= 5
      case 'shield': return me.shield === 0 && p.dice.length >= 4
      case 'night': return p.fighters.some(f => f.poison > 0) || p.dice.length >= 6
      case 'mrsha': return true
      case 'rumors': return p.hand.length < 4 && p.dice.length >= 4
      case 'chess': return false
    }
  }
  for (let i = 0; i < p.hand.length; i++) {
    if (want(p.hand[i]!) && can({ type: 'play', card: i })) return { type: 'play', card: i }
  }
  if (can({ type: 'skill' })) return { type: 'skill' }

  // До навыка не хватает кубика своей стихии — меняем лишнюю карту.
  const el = CARD_HEROES[me.id].el
  const matching = p.dice.filter(d => d === el || d === 'omni').length
  const stray = p.dice.findIndex(d => d !== el && d !== 'omni')
  if (matching < 3 && stray >= 0 && p.hand.length > 2 && !me.frozen) {
    const card = p.hand.findIndex(c => !want(c))
    if (card >= 0) return { type: 'tune', card, die: stray }
  }
  if (can({ type: 'attack' })) return { type: 'attack' }
  return { type: 'end' }
}
