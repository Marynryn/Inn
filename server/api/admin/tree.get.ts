import { asc, count, countDistinct, desc, eq, like } from "drizzle-orm";
import { treeWords, userTitles, users } from "../../database/schema";
import { requireAdmin } from "../../utils/admin-access";
import { useDb } from "../../utils/db";
import { readerName } from "../../utils/identity";
import { mskDay } from "../../utils/msk";
import { tierMark } from "#shared/utils/tree";
import { treeSettings, treeTiersList } from "../../utils/tree";

/** Вкладка «Ёлка»: настройки, редкости, слова, последние титулы и сколько
 *  трясли. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const db = useDb();

  const [words, recent, [total], [today]] = await Promise.all([
    db.select().from(treeWords).orderBy(asc(treeWords.kind), asc(treeWords.id)),
    db
      .select({ t: userTitles, u: users })
      .from(userTitles)
      .innerJoin(users, eq(users.id, userTitles.userId))
      .orderBy(desc(userTitles.id))
      .limit(60),
    db
      .select({ shakes: count(), people: countDistinct(userTitles.userId) })
      .from(userTitles),
    db
      .select({ shakes: count() })
      .from(userTitles)
      .where(like(userTitles.day, `${mskDay()}%`)),
  ]);

  const tiers = await treeTiersList();
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  return {
    settings: await treeSettings(),
    tiers,
    words,
    titles: recent.map(({ t, u }) => ({
      id: t.id,
      text: t.text,
      tier: tierMark(t.tierId ? tierById.get(t.tierId) : null),
      gifts: t.gifts,
      wonAt: t.createdAt,
      trial: t.day.includes("#"),
      name: readerName(u),
      code: u.publicId,
    })),
    stats: {
      shakes: total?.shakes ?? 0,
      people: total?.people ?? 0,
      today: today?.shakes ?? 0,
    },
  };
});
