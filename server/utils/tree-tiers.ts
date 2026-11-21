import { TIER_COLOR_RE, tierChanceOf } from "#shared/utils/tree";
import type { treeTiers } from "../database/schema";

type TierInsert = Partial<typeof treeTiers.$inferInsert>;

/** Редкость из формы админки — проверенная. Чего нет в теле — не трогаем. */
export function tierFromBody(body: Record<string, unknown>): TierInsert {
  const out: TierInsert = {};
  if ("name" in body) {
    const name = String(body.name ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30);
    if (!name)
      throw createError({ statusCode: 400, message: "Назови редкость" });
    out.name = name;
  }
  if ("color" in body) {
    const color = String(body.color ?? "").trim();
    if (!TIER_COLOR_RE.test(color))
      throw createError({
        statusCode: 400,
        message: "Цвет — в виде #rrggbb",
      });
    out.color = color.toLowerCase();
  }
  if ("chance" in body) {
    const chance = tierChanceOf(body.chance);
    if (chance === null)
      throw createError({
        statusCode: 400,
        message: "Шанс — число от 0 до 100",
      });
    out.chance = chance;
  }
  if ("pinned" in body) out.pinned = Boolean(body.pinned);
  if ("glow" in body) out.glow = Boolean(body.glow);
  return out;
}
