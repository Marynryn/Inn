import { flameCounts } from "../../utils/character-flames";
import { hiddenCharacterIds } from "../../utils/character-hidden";
import { characterCards } from "../../utils/characters";

/**
 * Полный список карточек для админа — вместе со спрятанными и с пометкой
 * hidden. Права проверяет server/middleware/admin-guard.ts. Огоньки админа
 * страница берёт так же, как у всех, из /api/characters/lit.
 */
export default defineEventHandler(async () => {
  const [cards, counts, hidden] = await Promise.all([
    characterCards(),
    flameCounts(),
    hiddenCharacterIds(),
  ]);
  return {
    characters: cards.map((c) => ({
      ...c,
      flames: counts[c.id] ?? 0,
      hidden: hidden.has(c.id),
    })),
  };
});
