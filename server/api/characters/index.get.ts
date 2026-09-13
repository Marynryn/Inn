import { flameSummary } from '../../utils/character-flames'
import { hiddenCharacterIds } from '../../utils/character-hidden'
import { characterCards } from '../../utils/characters'

/**
 * Все карточки разом: их немного, фильтры и поиск живут на странице.
 * Спрятанные админом читатель не получает вовсе; админ видит их с пометкой.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const isAdmin = session.user?.role === 'admin'

  const [cards, flames, hidden] = await Promise.all([characterCards(), flameSummary(event), hiddenCharacterIds()])
  return {
    characters: cards
      .filter(c => isAdmin || !hidden.has(c.id))
      .map(c => ({
        ...c,
        flames: flames.counts[c.id] ?? 0,
        lit: flames.mine.has(c.id),
        hidden: hidden.has(c.id),
      })),
  }
})
