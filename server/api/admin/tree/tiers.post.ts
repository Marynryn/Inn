import { treeTiers } from "../../../database/schema";
import { requireAdmin } from "../../../utils/admin-access";
import { useDb } from "../../../utils/db";
import { tierFromBody } from "../../../utils/tree-tiers";

/** Новая редкость слов: название, цвет, шанс, «сверху доски». */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
  const values = tierFromBody({ name: "", color: "", chance: "", ...body });
  const [tier] = await useDb()
    .insert(treeTiers)
    .values({
      name: values.name!,
      color: values.color!,
      chance: values.chance!,
      pinned: values.pinned ?? false,
      glow: values.glow ?? false,
    })
    .returning();
  return { tier };
});
