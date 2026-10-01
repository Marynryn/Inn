import { eq } from 'drizzle-orm'
import { userSkins, users } from '../../database/schema'
import { useDb } from '../../utils/db'
import { readerName } from '../../utils/identity'
import { listSkins } from '../../utils/skins'

/** Каталог скинов и у кого какой есть — для выдачи и отзыва из панели. */
export default defineEventHandler(async () => {
  const skins = await listSkins()

  const rows = await useDb()
    .select({
      skinId: userSkins.skinId,
      userId: userSkins.userId,
      displayName: users.displayName,
      email: users.email,
      wearing: users.skinId,
    })
    .from(userSkins)
    .innerJoin(users, eq(users.id, userSkins.userId))

  return skins.map(s => ({
    ...s,
    owners: rows
      .filter(r => r.skinId === s.id)
      .map(r => ({ id: r.userId, name: readerName(r), wearing: r.wearing === s.id })),
  }))
})
