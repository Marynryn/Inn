import { describe, expect, it } from "vitest";
import {
  ARMY_STEP,
  BOARD_MAP_IDS,
  BOARD_MAPS,
  boardLast,
  jumpTarget,
  type BoardServerMessage,
  type BoardState,
} from "#shared/utils/board";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  playSkill,
  rollDice,
  chooseDice,
  startGame,
} from "../../server/utils/board-rooms";
import { boardArrows } from "../../app/utils/boardArrows";

/** Сокет-заглушка: помнит последнее состояние стола. */
function fakePeer() {
  const peer = {
    state: null as BoardState | null,
    send(text: string) {
      const msg = JSON.parse(text) as BoardServerMessage;
      if (msg.type === "joined" || msg.type === "state") peer.state = msg.state;
    },
  };
  return peer;
}

/** Партия ботов до финиша: каждый в свой ход играет навык, если может, и бросает. */
function playGame(mapId: (typeof BOARD_MAP_IDS)[number], seats: number) {
  const users = Array.from({ length: seats }, (_, i) => ({
    id: 1000 + Math.floor(Math.random() * 1e9) + i,
    name: `Игрок ${i + 1}`,
    avatarUrl: null,
    admin: true,
  }));
  const code = createRoom(users[0]!, mapId);
  const peers = users.map(() => fakePeer());
  users.forEach((u, i) => expect(joinRoom(code, u, peers[i])).toBeNull());
  startGame(peers[0]);

  const woke = new Set<string>();
  /** Охотник, раз выйдя, с карты не уходит. */
  let left = false;
  let prevAt: (number | null)[] = [];
  /** Как шагала армия Гоблинов, если ступила не так: только вперёд, ровным
   *  шагом, а с конца участка — снова к началу. */
  const armyBad: string[] = [];
  /** Сколько раз армия дошла до конца и выступила снова. */
  let armyLaps = 0;
  const host = peers[0]!;
  for (let step = 0; step < 4000; step++) {
    const st = host.state!;
    for (const [i, h] of st.hunters.entries()) {
      if (h.at !== null) woke.add(BOARD_MAPS[mapId].hunters[i]!.kind);
      if (h.at === null && prevAt[i] != null) left = true;
      const def = BOARD_MAPS[mapId].hunters[i]!;
      const was = prevAt[i];
      if (def.kind !== "army" || was == null || h.at === null) continue;
      if (h.at === was) continue;
      // За одно действие круг может замкнуться и дважды — если кто-то
      // пропускает ход: тогда и шагов у армии два.
      const ok =
        h.at > was
          ? (h.at - was) % ARMY_STEP === 0 || h.at === def.zone[1]
          : was + ARMY_STEP >= def.zone[1] &&
            (h.at - def.start) % ARMY_STEP === 0;
      if (!ok) armyBad.push(`${was} → ${h.at}`);
      if (h.at < was) armyLaps++;
    }
    prevAt = st.hunters.map((h) => h.at);
    if (st.status === "finished") {
      for (const p of peers) leaveRoom(p);
      return { st, woke, left, steps: step, armyBad, armyLaps };
    }
    const seat = st.players.findIndex((p) => p.slot === st.turnSlot);
    const peer = peers[seat]!;
    const me = st.players[seat]!;
    if (st.choice) {
      chooseDice(peer, Math.random() < 0.5 ? 0 : 1);
      continue;
    }
    const skill = me.skills.find((s) => s !== "danger");
    if (skill && !st.skillUsed && Math.random() < 0.5) {
      const rival = st.players.find((p) => p.slot !== me.slot);
      playSkill(peer, skill, rival?.slot);
      continue;
    }
    rollDice(peer);
  }
  throw new Error("партия не закончилась за 4000 действий");
}

describe("настольная игра: карты", () => {
  it("у каждой карты стрелки не выходят за поле и не ведут на старт с финиша", () => {
    for (const id of BOARD_MAP_IDS) {
      const map = BOARD_MAPS[id];
      const last = boardLast(map);
      expect(map.cells[last]!.effect.kind).toBe("none");
      for (let i = 0; i <= last; i++) {
        const to = jumpTarget(map, i);
        if (to === null) continue;
        expect(to).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThanOrEqual(last);
      }
      for (const h of map.hunters) {
        expect(h.zone[0]).toBeGreaterThanOrEqual(1);
        expect(h.zone[1]).toBeLessThan(last);
        expect(h.start).toBeGreaterThanOrEqual(h.zone[0]);
        expect(h.start).toBeLessThanOrEqual(h.zone[1]);
      }
    }
  });

  it("продолжение вдвое длиннее первого тома", () => {
    expect(BOARD_MAPS.v23.cells.length - 1).toBe(
      (BOARD_MAPS.v1.cells.length - 1) * 2,
    );
  });

  it("стрелки второй карты не ведут на другую стрелку, навык или «ещё бросок»", () => {
    const map = BOARD_MAPS.v23;
    for (let i = 0; i < map.cells.length; i++) {
      const to = jumpTarget(map, i);
      if (to === null) continue;
      const cell = map.cells[to]!;
      expect(jumpTarget(map, to), `${i} → ${to}`).toBeNull();
      expect(cell.skill, `${i} → ${to}`).toBeUndefined();
      expect(cell.effect.kind, `${i} → ${to}`).not.toBe("again");
    }
  });
});

/** Точки кривой Безье стрелки (путь вида «M x,y C x,y x,y x,y»). */
function arrowPoints(d: string) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = d
    .match(/-?\d+(\.\d+)?/g)!
    .map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return Array.from({ length: 31 }, (_, k) => {
    const t = k / 30,
      u = 1 - t;
    return [
      u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
      u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
    ] as const;
  });
}
function crosses(
  a: (readonly [number, number])[],
  b: (readonly [number, number])[],
) {
  const side = (
    p: readonly number[],
    q: readonly number[],
    r: readonly number[],
  ) => (q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!);
  for (let i = 0; i < a.length - 1; i++)
    for (let j = 0; j < b.length - 1; j++) {
      const [p1, p2, q1, q2] = [a[i]!, a[i + 1]!, b[j]!, b[j + 1]!];
      if (
        side(p1, p2, q1) * side(p1, p2, q2) < 0 &&
        side(q1, q2, p1) * side(q1, q2, p2) < 0
      )
        return true;
    }
  return false;
}

describe("настольная игра: стрелки", () => {
  it("на карте томов 2–3 стрелки не пересекаются и не ведут в одну клетку", () => {
    const map = BOARD_MAPS.v23;
    const arrows = boardArrows(
      map.cells,
      (i) => jumpTarget(map, i),
      1.6,
      1.6 / map.ratio,
    );
    const lines = arrows.map((a) => ({
      name: `${a.from}→${a.to}`,
      p: arrowPoints(a.d),
    }));
    const bad: string[] = [];
    for (let i = 0; i < lines.length; i++)
      for (let j = i + 1; j < lines.length; j++)
        if (crosses(lines[i]!.p, lines[j]!.p))
          bad.push(`${lines[i]!.name} × ${lines[j]!.name}`);
    expect(bad).toEqual([]);
    const targets = arrows.map((a) => a.to);
    expect(new Set(targets).size).toBe(targets.length);
  });
});

describe("настольная игра: партии ботов", () => {
  for (const id of BOARD_MAP_IDS) {
    it(`карта ${id}: партии доходят до финиша, охотники выходят`, () => {
      const woke = new Set<string>();
      let armyLaps = 0;
      for (let g = 0; g < 150; g++) {
        const r = playGame(id, 1 + (g % 4));
        expect(r.st.winnerSlot).not.toBeNull();
        const winner = r.st.players.find((p) => p.slot === r.st.winnerSlot)!;
        expect(winner.pos).toBe(boardLast(BOARD_MAPS[id]));
        for (const p of r.st.players) {
          expect(p.skills.length).toBeLessThanOrEqual(3);
          expect(p.pos).toBeGreaterThanOrEqual(0);
        }
        // Охотник стоит только на своём участке.
        for (const [i, h] of r.st.hunters.entries()) {
          if (h.at === null) continue;
          const [lo, hi] = BOARD_MAPS[id].hunters[i]!.zone;
          expect(h.at).toBeGreaterThanOrEqual(lo);
          expect(h.at).toBeLessThanOrEqual(hi);
        }
        for (const k of r.woke) woke.add(k);
        expect(r.left).toBe(false);
        expect(r.armyBad).toEqual([]);
        armyLaps += r.armyLaps;
      }
      if (BOARD_MAPS[id].hunters.some((h) => h.kind === "army"))
        expect(armyLaps).toBeGreaterThan(0);
      expect([...woke].sort()).toEqual(
        BOARD_MAPS[id].hunters.map((h) => h.kind).sort(),
      );
    });
  }
});
