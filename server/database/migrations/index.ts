import { baseline } from "./0001-baseline";
import { commentReactionsUnique } from "./0002-comment-reactions-unique";
import type { Migration } from "./helpers";

/**
 * Миграции по порядку. Каждая выполняется один раз: после неё номер ложится в
 * PRAGMA user_version, и на следующем старте она пропускается.
 *
 * Новая миграция — новый файл с номером на единицу больше последнего и строка
 * здесь. Уже выпущенные не правятся: на боевой базе они прошли, и правка до
 * неё не дойдёт. Миграция идёт одной транзакцией вместе с отметкой версии —
 * упала посередине, значит, база осталась как была, а ошибка видна в логе.
 */
export const MIGRATIONS: Migration[] = [baseline, commentReactionsUnique];
