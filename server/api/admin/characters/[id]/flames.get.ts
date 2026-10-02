import { desc, eq } from 'drizzle-orm'
import { characterFlames, users } from '../../../../database/schema'
import { useDb } from '../../../../utils/db'
import { readerName } from '../../../../utils/identity'

/**
 * Кто зажёг огонёк персонажу. Вошедших знаем по аккаунту — их по именам,
 * свежие сверху; гостя знаем только по IP, его наружу не отдаём, только
 * сколько их. Доступ — admin-guard.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''

  const rows = await useDb()
    .select({
      userId: characterFlames.userId,
      displayName: users.displayName,
      email: users.email,
    })
    .from(characterFlames)
    .leftJoin(users, eq(users.id, characterFlames.userId))
    .where(eq(characterFlames.characterId, id))
    .orderBy(desc(characterFlames.id))

  const readers = rows.filter(r => r.userId !== null)
  return {
    readers: readers.map(r => readerName({ displayName: r.displayName, email: r.email })),
    guests: rows.length - readers.length,
  }
})
