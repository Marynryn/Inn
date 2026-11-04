import { and, eq, isNull, sql } from "drizzle-orm";
import type { H3Event } from "h3";
import { characterFlames } from "../database/schema";
import { useDb } from "./db";

/** Кто ставит огонёк: вошедший — по аккаунту, гость — по IP. */
export async function flameActor(event: H3Event) {
  const session = await getUserSession(event);
  const userId = (session.user as { id?: number } | undefined)?.id ?? null;
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
  return { userId, ip };
}

const mineFilter = (actor: { userId: number | null; ip: string }) =>
  actor.userId
    ? eq(characterFlames.userId, actor.userId)
    : and(eq(characterFlames.ip, actor.ip), isNull(characterFlames.userId));

/**
 * Счётчики по всем персонажам. Одинаковы для всех, кто спрашивает: ни сессия,
 * ни IP сюда не входят, поэтому их можно отдавать в общем списке.
 */
export async function flameCounts(): Promise<Record<string, number>> {
  const rows = await useDb()
    .select({
      characterId: characterFlames.characterId,
      count: sql<number>`count(*)`,
    })
    .from(characterFlames)
    .groupBy(characterFlames.characterId);
  return Object.fromEntries(rows.map((r) => [r.characterId, Number(r.count)]));
}

/** Персонажи, которым этот человек зажёг огонёк. Только для личного запроса. */
export async function myFlames(event: H3Event): Promise<string[]> {
  const actor = await flameActor(event);
  const rows = await useDb()
    .select({ characterId: characterFlames.characterId })
    .from(characterFlames)
    .where(mineFilter(actor));
  return rows.map((r) => r.characterId);
}

/** Поставить или снять огонёк; возвращает новое состояние для этого персонажа. */
export async function toggleFlame(event: H3Event, characterId: string) {
  const db = useDb();
  const actor = await flameActor(event);
  const own = and(
    eq(characterFlames.characterId, characterId),
    mineFilter(actor),
  );

  const existing = await db
    .select({ id: characterFlames.id })
    .from(characterFlames)
    .where(own);
  if (existing.length) {
    await db.delete(characterFlames).where(own);
  } else {
    await db.insert(characterFlames).values({
      characterId,
      userId: actor.userId,
      ip: actor.userId ? null : actor.ip,
    });
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(characterFlames)
    .where(eq(characterFlames.characterId, characterId));

  return { lit: !existing.length, flames: Number(row?.count ?? 0) };
}
