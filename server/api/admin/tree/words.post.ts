import { isWordKind } from "#shared/utils/tree";
import { treeWords } from "../../../database/schema";
import { requireAdmin } from "../../../utils/admin-access";
import { useDb } from "../../../utils/db";
import { wordFromBody } from "../../../utils/tree-words";

/** Новое слово для ёлки. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
  if (!isWordKind(body.kind))
    throw createError({ statusCode: 400, message: "Неизвестный вид слова" });

  const values = wordFromBody({ word: "", ...body }, body.kind);
  if (body.kind === "noun" && !values.gender)
    throw createError({ statusCode: 400, message: "Укажи род" });

  const [word] = await useDb()
    .insert(treeWords)
    .values({ ...values, kind: body.kind, word: values.word! })
    .returning();
  return { word };
});
