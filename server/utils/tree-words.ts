import type { TreeWordKind } from "#shared/utils/tree";
import { cleanWord, isGender, isWordKind } from "#shared/utils/tree";
import type { treeWords } from "../database/schema";

type WordInsert = Partial<typeof treeWords.$inferInsert>;

/**
 * Слово из формы админки — проверенное. kind берётся из тела только при
 * создании; у существующего слова вид не меняется — передаётся сюда.
 * Пустые формы рода значат «угадать».
 */
export function wordFromBody(
  body: Record<string, unknown>,
  kind: TreeWordKind,
): WordInsert {
  if (!isWordKind(kind))
    throw createError({ statusCode: 400, message: "Неизвестный вид слова" });

  const out: WordInsert = {};
  if ("word" in body) {
    const word = cleanWord(body.word);
    if (!word) throw createError({ statusCode: 400, message: "Пустое слово" });
    out.word = word;
  }
  if (kind === "adj") {
    if ("wordF" in body) out.wordF = cleanWord(body.wordF) || null;
    if ("wordN" in body) out.wordN = cleanWord(body.wordN) || null;
  }
  if (kind === "noun" && "gender" in body) {
    if (!isGender(body.gender))
      throw createError({ statusCode: 400, message: "Укажи род" });
    out.gender = body.gender;
  }
  if ("rare" in body) out.rare = Boolean(body.rare);
  if ("active" in body) out.active = Boolean(body.active);
  return out;
}
