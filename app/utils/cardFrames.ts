import { CARD_HEROES, type Element, type HeroId } from "#shared/utils/cards";

/**
 * Рамки стихий «Странствующей колоды» — public/cards/frames/<стихия>.webp.
 * У всех шести один холст 393×535 и одно окно под портрет (x 83…313,
 * y 66…≈362), а плашка-пергамент снизу у каждой на своей высоте. Здесь —
 * её середина в процентах ширины карты (cqw), по замеру файлов: без
 * поправки надписи на плашке прыгали от карты к карте.
 */
const PLATE_Y: Record<Element, string> = {
  fire: "107.6cqw",
  ice: "111.5cqw",
  wind: "105.9cqw",
  magic: "108.4cqw",
  steel: "107.1cqw",
  poison: "107.9cqw",
};

/** CSS-переменные карты героя: цвет стихии, рамка, высота плашки. */
export const heroCardStyle = (id: HeroId, color: string) => ({
  "--el": color,
  "--frame": `url(/cards/frames/${CARD_HEROES[id].el}.webp)`,
  "--plate": PLATE_Y[CARD_HEROES[id].el],
});
