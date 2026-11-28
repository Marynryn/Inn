import { randomInt } from "node:crypto";
import { and, desc, eq, inArray, like, not } from "drizzle-orm";
import type {
  BoardEntry,
  DrawWord,
  NameTitle,
  ShakeResult,
  TitleSwap,
  TreeBoard,
  TreeMode,
  TreeTexts,
  TreeTier,
  TreeWordKind,
  WordBook,
} from "#shared/utils/tree";
import {
  TREE_BOARD_RARE,
  TREE_BOARD_RECENT,
  TREE_THREE_CHANCE_DEFAULT,
  buildTitle,
  drawTitle,
  fullTreeTexts,
  legacyRarity,
  tierIdOf,
  percentOf,
  swapWords,
  tierMark,
  titleParts,
  titleSwaps,
  treeModeOf,
} from "#shared/utils/tree";
import {
  siteSettings,
  treeTiers,
  treeWords,
  userTitles,
  users,
} from "../database/schema";
import { useDb } from "./db";
import { framesByIds } from "./frames";
import { readerName } from "./identity";
import { mskDay } from "./msk";

type TitleRow = typeof userTitles.$inferSelect;

export type TreeSettings = {
  mode: TreeMode;
  threeChance: number;
  texts: TreeTexts;
};

/** Настройки ёлки — из общих настроек сайта, их правит админка. */
export async function treeSettings(): Promise<TreeSettings> {
  const rows = await useDb()
    .select()
    .from(siteSettings)
    .where(like(siteSettings.key, "tree_%"));
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    mode: treeModeOf(s.tree_mode),
    threeChance: percentOf(s.tree_three_chance, TREE_THREE_CHANCE_DEFAULT),
    texts: fullTreeTexts(s),
  };
}

/** Видны ли этому человеку титулы у имён. Пока ивент идёт — там же, где
 *  видна ёлка: в пробе «только для админов» читатели не видят пробных
 *  титулов админа. Ивент закончился — титулы видны всем. */
export async function titlesShownTo(
  role: string | undefined,
): Promise<boolean> {
  const { mode } = await treeSettings();
  return (
    mode === "on" || mode === "ended" || (mode === "admins" && role === "admin")
  );
}

/** Какой титул показать у имени: надетый, если его не скрыли. */
export const shownTitleId = (u: {
  titleId: number | null;
  titleHidden: boolean;
}): number | null => (u.titleHidden ? null : u.titleId);

/** Что сейчас с титулами у этого человека: идёт ивент (снятый титул
 *  пропадает), ивент закончился (титул можно скрыть и вернуть) или ни то
 *  ни другое. */
export async function titleSeason(
  role: string | undefined,
): Promise<"event" | "ended" | null> {
  const { mode } = await treeSettings();
  if (mode === "on" || (mode === "admins" && role === "admin")) return "event";
  if (mode === "ended") return "ended";
  return null;
}

/** Ёлка, если этому человеку её видно: «только для админов» — проба на
 *  проде, и читателю ёлки будто нет. */
export async function treeFor(
  role: string | undefined,
): Promise<TreeSettings | null> {
  const s = await treeSettings();
  if (s.mode === "on" || (s.mode === "admins" && role === "admin")) return s;
  return null;
}

/** Титул для показа: редкость — по записанной у титула, слова — с их
 *  редкостями, чтобы подчеркнуть. Слов нет (старый титул) — целиком. */
export const toNameTitle = (r: TitleRow, book: WordBook): NameTitle => {
  const parts = r.words ? titleParts(book, r.words) : null;
  // Редкость — по словам, как они сейчас (в ней и «Необычное», которое не
  // хранится); слов нет — какая записана.
  const built = r.words ? buildTitle(book, r.words) : null;
  return {
    id: r.id,
    text: r.text,
    tier: tierMark(
      built ? built.tier : r.tierId ? book.tiers.get(r.tierId) : null,
    ),
    ...(parts ? { parts } : {}),
  };
};

/** Редкости ёлки — как их завели в админке. */
export async function treeTiersList(): Promise<TreeTier[]> {
  return useDb().select().from(treeTiers).orderBy(treeTiers.chance);
}

/** Последний титул, выигранный сегодня, — или null. У админа их за день
 *  бывает несколько: день у них «2026-12-20#…». */
export async function todaysTitle(userId: number): Promise<TitleRow | null> {
  const [row] = await useDb()
    .select()
    .from(userTitles)
    .where(
      and(eq(userTitles.userId, userId), like(userTitles.day, `${mskDay()}%`)),
    )
    .orderBy(desc(userTitles.id))
    .limit(1);
  return row ?? null;
}

const isUniqueViolation = (e: any) =>
  /UNIQUE constraint failed/.test(
    `${e?.message ?? ""} ${e?.cause?.message ?? ""}`,
  );

/**
 * Встряска. Что выпало, решает сервер — окно лишь показывает, как подарки
 * падают. Новый титул сам не надевается: его берут (и тогда прежний пропадает
 * насовсем) или оставляют свой. Взять можно до полуночи — см. takeTitle.
 *
 * Раз в день держит уникальный индекс, а не проверка: двойной клик или вторая
 * вкладка иначе проскочили бы между чтением и записью. Админ трясёт сколько
 * угодно: его вторая и дальше попытки пишутся с днём «…#…».
 */
export async function shake(
  userId: number,
  role: string | undefined,
): Promise<ShakeResult> {
  const settings = await treeFor(role);
  if (!settings)
    throw createError({ statusCode: 404, message: "Ёлки сейчас нет" });

  const words = (await useDb()
    .select()
    .from(treeWords)
    .where(eq(treeWords.active, true))) as DrawWord[];
  const draw = drawTitle(
    words,
    await treeTiersList(),
    settings.threeChance,
    randomInt,
  );
  if (!draw)
    throw createError({
      statusCode: 500,
      message: "На ёлке не хватает слов — загляни позже",
    });

  const day = mskDay();
  const insert = (d: string) =>
    useDb()
      .insert(userTitles)
      .values({
        userId,
        text: draw.text,
        rarity: legacyRarity(draw.tier, draw.gifts.length),
        tierId: tierIdOf(draw.tier),
        gifts: draw.gifts.length,
        words: draw.words,
        day: d,
      })
      .returning();

  let row: TitleRow;
  try {
    [row] = (await insert(day)) as [TitleRow];
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    if (role !== "admin")
      throw createError({
        statusCode: 409,
        message: "Сегодня ёлку уже трясли — приходи после полуночи",
      });
    [row] = (await insert(`${day}#${Date.now()}${randomInt(1000)}`)) as [
      TitleRow,
    ];
  }

  const book = await wordBook();
  return {
    gifts: draw.gifts,
    title: toNameTitle(row, book),
    current: await wornTitle(userId),
    swaps: await swapsFor(userId, row),
    entry: await boardEntryOf(row, settings.mode, book),
  };
}

/** Все слова ёлки по номерам — и убранные из раздачи: из них собраны
 *  уже выпавшие титулы, — и все редкости. */
export async function wordBook(): Promise<WordBook> {
  const [rows, tiers] = await Promise.all([
    useDb().select().from(treeWords) as Promise<DrawWord[]>,
    treeTiersList(),
  ]);
  return {
    words: new Map(rows.map((w) => [w.id, w])),
    tiers: new Map(tiers.map((t) => [t.id, t])),
  };
}

async function wornRow(userId: number): Promise<TitleRow | null> {
  const [u] = await useDb()
    .select({ titleId: users.titleId })
    .from(users)
    .where(eq(users.id, userId));
  if (!u?.titleId) return null;
  const [row] = await useDb()
    .select()
    .from(userTitles)
    .where(eq(userTitles.id, u.titleId));
  return row ?? null;
}

/** Какое одно слово из выпавшего можно поставить в надетый титул. Пока
 *  выпавший не взят — потом выбирать уже не из чего. */
export async function swapsFor(
  userId: number,
  fresh: TitleRow,
): Promise<TitleSwap[]> {
  const worn = await wornRow(userId);
  if (!worn?.words || !fresh.words || worn.id === fresh.id) return [];
  return titleSwaps(await wordBook(), worn.words, fresh.words);
}

/** Что человек носит сейчас. */
export async function wornTitle(userId: number): Promise<NameTitle | null> {
  const [u] = await useDb()
    .select({ titleId: users.titleId })
    .from(users)
    .where(eq(users.id, userId));
  return titleById(u?.titleId);
}

/**
 * Взять выпавший титул вместо надетого. Только последний выпавший сегодня:
 * вчерашний, не взятый до полуночи, сгорел, а прежние, однажды снятые, назад
 * не надеваются — поменял, значит потерял.
 *
 * С slot — не целиком, а одно слово из него в свой титул. Тогда сегодняшняя
 * запись сама становится собранным титулом: на доске видно то, что человек
 * в итоге носит, а прежний остаётся в его истории как был.
 */
export async function takeTitle(
  userId: number,
  titleId: number,
  slot?: TreeWordKind,
): Promise<NameTitle> {
  let fresh = await todaysTitle(userId);
  if (!fresh || fresh.id !== titleId)
    throw createError({
      statusCode: 403,
      message:
        "Этот титул уже не взять — взять можно только последний выпавший",
    });
  if (slot) {
    const swap = (await swapsFor(userId, fresh)).find((s) => s.slot === slot);
    const worn = await wornRow(userId);
    const words =
      swap && worn?.words && fresh.words
        ? swapWords(worn.words, fresh.words, slot)
        : null;
    const built = words ? buildTitle(await wordBook(), words) : null;
    if (!words || !built)
      throw createError({
        statusCode: 409,
        message: "Это слово сюда не поставить — возьми титул целиком",
      });
    [fresh] = (await useDb()
      .update(userTitles)
      .set({
        text: built.text,
        rarity: legacyRarity(built.tier, words.tail ? 3 : 2),
        tierId: tierIdOf(built.tier),
        gifts: words.tail ? 3 : 2,
        words,
      })
      .where(eq(userTitles.id, fresh.id))
      .returning()) as [TitleRow];
  }
  await useDb()
    .update(users)
    .set({ titleId: fresh.id })
    .where(eq(users.id, userId));
  return toNameTitle(fresh, await wordBook());
}

/** Надет ли титул, выпавший сегодня, — тогда его не снять до полуночи. */
export async function isFreshTitle(
  titleId: number | null | undefined,
): Promise<boolean> {
  if (!titleId) return false;
  const [row] = await useDb()
    .select({ day: userTitles.day })
    .from(userTitles)
    .where(eq(userTitles.id, titleId));
  return Boolean(row?.day.startsWith(mskDay()));
}

/** Титулы по номерам — одним запросом на страницу комментариев. */
export async function titlesByIds(
  ids: (number | null | undefined)[],
): Promise<Map<number, NameTitle>> {
  const want = [...new Set(ids.filter((id): id is number => Boolean(id)))];
  if (!want.length) return new Map();
  const rows = await useDb()
    .select()
    .from(userTitles)
    .where(inArray(userTitles.id, want));
  const book = await wordBook();
  return new Map(rows.map((r) => [r.id, toNameTitle(r, book)]));
}

export async function titleById(
  id: number | null | undefined,
): Promise<NameTitle | null> {
  return id ? ((await titlesByIds([id])).get(id) ?? null) : null;
}

/**
 * Можно ли в профиле поставить такой титул. Из профиля титул только снимают
 * (null) — насовсем; надеть прежний нельзя, новые берут у ёлки. Взятый сегодня
 * держится до полуночи. Вернёт текст ошибки или null, если можно.
 */
export async function titleWearError(
  userId: number,
  titleId: number | null,
): Promise<string | null> {
  const [u] = await useDb()
    .select({ titleId: users.titleId })
    .from(users)
    .where(eq(users.id, userId));
  const worn = u?.titleId ?? null;
  if (titleId === worn) return null;
  if (titleId)
    return "Снятый титул назад не надеть — новый можно вытрясти из ёлки";
  if (await isFreshTitle(worn))
    return "Свежий титул носится до полуночи — снять его можно завтра";
  return null;
}

/**
 * Доска титулов: с редкостями «сверху доски» — весь сезон (30 последних),
 * ниже — 40 свежих;
 * на главной она прокручивается в своей рамке. Заблокированных на
 * доске нет. Пока ёлка для всех, пробные встряски админа («…#…») не видны;
 * пока она только для админов — видно всё, иначе пробовать было бы нечего.
 */
export async function treeBoard(mode: TreeMode): Promise<TreeBoard> {
  const db = useDb();
  const where = and(
    eq(users.isBanned, false),
    mode === "on" ? not(like(userTitles.day, "%#%")) : undefined,
  );
  const select = () =>
    db
      .select({ t: userTitles, u: users })
      .from(userTitles)
      .innerJoin(users, eq(users.id, userTitles.userId));

  const book = await wordBook();
  const pinned = [...book.tiers.values()]
    .filter((t) => t.pinned)
    .map((t) => t.id);
  const [rare, recent] = await Promise.all([
    pinned.length
      ? select()
          .where(and(where, inArray(userTitles.tierId, pinned)))
          .orderBy(desc(userTitles.id))
          .limit(TREE_BOARD_RARE)
      : Promise.resolve([]),
    select().where(where).orderBy(desc(userTitles.id)).limit(TREE_BOARD_RECENT),
  ]);

  const entries = await toBoardEntries([...rare, ...recent], book);
  return {
    rare: entries.slice(0, rare.length),
    recent: entries.slice(rare.length),
    pinned,
  };
}

type BoardRow = { t: TitleRow; u: typeof users.$inferSelect };

/** Строки доски: титул с хозяином — именем, аватаркой и рамкой. */
async function toBoardEntries(
  rows: BoardRow[],
  book: WordBook,
): Promise<BoardEntry[]> {
  const frames = await framesByIds(rows.map((r) => r.u.avatarFrameId));
  return rows.map(({ t, u }) => ({
    ...toNameTitle(t, book),
    wonAt: t.createdAt,
    name: readerName(u),
    code: u.publicId,
    avatarUrl: u.avatarUrl,
    avatarFrame: u.avatarFrameId ? (frames.get(u.avatarFrameId) ?? null) : null,
  }));
}

/** Строка доски для только что выпавшего титула — по тем же правилам, что и
 *  treeBoard: пробные встряски админа, пока ёлка для всех, и титулы
 *  забаненных на доску не попадают (null). */
async function boardEntryOf(
  row: TitleRow,
  mode: TreeMode,
  book: WordBook,
): Promise<BoardEntry | null> {
  if (mode === "on" && row.day.includes("#")) return null;
  const [u] = await useDb()
    .select()
    .from(users)
    .where(eq(users.id, row.userId));
  if (!u || u.isBanned) return null;
  const [entry] = await toBoardEntries([{ t: row, u }], book);
  return entry ?? null;
}

/** Убрать титул совсем — из коллекции и с того, кто его носит. Для админки:
 *  на случай, если слова сложились во что-то неудачное. */
export async function deleteTitle(id: number): Promise<boolean> {
  const db = useDb();
  const gone = await db
    .delete(userTitles)
    .where(eq(userTitles.id, id))
    .returning();
  if (!gone.length) return false;
  await db.update(users).set({ titleId: null }).where(eq(users.titleId, id));
  return true;
}
