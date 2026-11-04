import type { PublicCharacter } from "#shared/utils/characters";
import { flameCounts } from "../../utils/character-flames";
import { hiddenCharacterIds } from "../../utils/character-hidden";
import { characterCards } from "../../utils/characters";

/**
 * Все карточки разом: их немного, фильтры и поиск живут на странице.
 *
 * Ответ одинаков для всех — ни роль, ни сессия, ни IP в него не входят, чтобы
 * страницу можно было отдавать из общего кеша. Спрятанных карточек здесь нет
 * ни для кого: админ берёт полный список из /api/admin/characters. Свои
 * огоньки читатель спрашивает отдельно — /api/characters/lit, уже из браузера.
 */
export default defineEventHandler(async () => {
  const [cards, counts, hidden] = await Promise.all([
    characterCards(),
    flameCounts(),
    hiddenCharacterIds(),
  ]);
  const characters: PublicCharacter[] = cards
    .filter((c) => !hidden.has(c.id))
    .map((c) => ({ ...c, flames: counts[c.id] ?? 0 }));
  return { characters };
});
