import { describe, expect, it } from "vitest";
import {
  CARD_HEROES,
  CARD_HERO_IDS,
  HAND_MAX,
  cardsApply,
  cardsCheck,
  cardsComputerMove,
  cardsForfeit,
  cardsPayment,
  cardsView,
  isCardsAction,
  isHeroTeam,
  newCardsGame,
  randomCardsTeam,
  type Action,
  type Side,
} from "#shared/utils/cards";

type Game = ReturnType<typeof newCardsGame>;

/** Кто сейчас должен ходить. */
const actor = (g: Game): Side =>
  (g.choosing ??
    (g.phase === "reroll" ? (g.players[0].rolling ? 0 : 1) : g.turn)) as Side;

/**
 * Ход за «человека» (сторона 0) — тем же мозгом, что у компьютера, только
 * глядя на стол с его стороны. Перебросы и выбор героя за сторону 1 движок в
 * режиме против компьютера делает сам.
 */
function moveFor(g: Game, side: Side): Action {
  if (side === 1) return cardsComputerMove(g);
  if (g.choosing === 0)
    return {
      type: "choose",
      to: g.players[0].fighters.findIndex((f) => f.hp > 0),
    };
  if (g.phase === "reroll") return { type: "reroll", dice: [] };
  return cardsComputerMove(cardsView(g, 1));
}

describe("Карты таверны: движок", () => {
  it("сотня партий доигрывается до конца, и ни один ход не нарушает правил", () => {
    for (let seed = 1; seed <= 100; seed++) {
      let g = newCardsGame(
        randomCardsTeam(seed),
        randomCardsTeam(seed * 7 + 3),
        seed,
      );
      let steps = 0;
      for (; steps < 1000 && g.phase !== "over"; steps++) {
        const side = actor(g);
        const a = moveFor(g, side);
        const check = cardsCheck(g, side, a);
        expect(
          check,
          `партия ${seed}, ход ${steps}: ${JSON.stringify(a)}`,
        ).toMatchObject({ ok: true });
        g = cardsApply(g, side, a);

        for (const p of g.players) {
          expect(p.hand.length).toBeLessThanOrEqual(HAND_MAX);
          for (const f of p.fighters) {
            expect(f.hp).toBeGreaterThanOrEqual(0);
            expect(f.hp).toBeLessThanOrEqual(CARD_HEROES[f.id].hp);
          }
        }
      }
      expect(g.phase, `партия ${seed} не кончилась за ${steps} ходов`).toBe(
        "over",
      );
      expect(g.winner).not.toBeNull();
    }
    // Сотня партий на медленной машине идёт дольше пяти секунд по умолчанию.
  }, 30_000);

  it("одна и та же раскладка с тем же зерном даёт ту же партию", () => {
    const play = () => {
      let g = newCardsGame(
        CARD_HERO_IDS.slice(0, 3),
        CARD_HERO_IDS.slice(3, 6),
        42,
      );
      for (let i = 0; i < 40 && g.phase !== "over"; i++) {
        const side = actor(g);
        g = cardsApply(g, side, moveFor(g, side));
      }
      return JSON.stringify(g.players.map((p) => p.fighters.map((f) => f.hp)));
    };
    expect(play()).toBe(play());
  });

  it("недопустимый ход не меняет партию", () => {
    const g = newCardsGame(randomCardsTeam(1), randomCardsTeam(2), 1);
    // В начале партии идёт переброс кубиков — атаковать нельзя.
    expect(cardsCheck(g, 0, { type: "attack" }).ok).toBe(false);
    expect(cardsApply(g, 0, { type: "attack" })).toBe(g);
  });

  it("сдавшийся проигрывает, и после этого ходов нет", () => {
    const g = cardsForfeit(
      newCardsGame(randomCardsTeam(3), randomCardsTeam(4), 3),
      0,
    );
    expect(g.phase).toBe("over");
    expect(g.winner).toBe(1);
    expect(cardsCheck(g, 1, { type: "end" }).ok).toBe(false);
  });

  it("платит кубиками своей стихии и всемогущими, а не хватает — null", () => {
    const hero = CARD_HEROES[CARD_HERO_IDS[0]!];
    const el = hero.el;
    const other = Object.keys(CARD_HEROES)
      .map((id) => CARD_HEROES[id as keyof typeof CARD_HEROES].el)
      .find((e) => e !== el)!;
    expect(cardsPayment([el, "omni", other], { el: 2 }, el)?.sort()).toEqual([
      0, 1,
    ]);
    expect(cardsPayment([other, other], { el: 2 }, el)).toBeNull();
  });

  it("Чумной туман ставит метку Яда, а по метке Огня даёт Взрыв", () => {
    const g = newCardsGame(
      ["typhenous", "erin", "relc"],
      ["relc", "yvlon", "ceria"],
      5,
    );
    g.phase = "action";
    g.turn = 0;
    for (const p of g.players) p.rolling = false;
    g.players[0].active = 0;
    g.players[0].dice = ["poison", "poison", "poison"];
    const foes = g.players[1].fighters;
    foes[1]!.aura = "fire";

    const after = cardsApply(g, 0, { type: "skill" });
    expect(after).not.toBe(g);
    const [relc, yvlon, ceria] = after.players[1].fighters;
    for (const f of after.players[1].fighters) expect(f.poison).toBe(2);
    // У кого метки не было — теперь метка Яда.
    expect(ceria!.aura).toBe("poison");
    expect(relc!.aura).toBe("poison");
    // Взрыв по метке Огня на Ивлон: 0 + 1 урона ей и по 1 остальным.
    expect(yvlon!.aura).toBeNull();
    expect(yvlon!.hp).toBe(CARD_HEROES.yvlon.hp - 1);
    expect(relc!.hp).toBe(CARD_HEROES.relc.hp - 1);
    expect(ceria!.hp).toBe(CARD_HEROES.ceria.hp - 1);
  });

  it("проверка входящих ходов и составов отсекает мусор", () => {
    expect(isCardsAction({ type: "attack" })).toBe(true);
    expect(isCardsAction({ type: "play", card: -1 })).toBe(false);
    expect(isCardsAction({ type: "hack" })).toBe(false);
    expect(isCardsAction(null)).toBe(false);

    expect(isHeroTeam(CARD_HERO_IDS.slice(0, 3))).toBe(true);
    expect(
      isHeroTeam([CARD_HERO_IDS[0], CARD_HERO_IDS[0], CARD_HERO_IDS[1]]),
    ).toBe(false);
    expect(isHeroTeam(["nobody", CARD_HERO_IDS[0], CARD_HERO_IDS[1]])).toBe(
      false,
    );
  });
});
