import { baseline } from "./0001-baseline";
import { commentReactionsUnique } from "./0002-comment-reactions-unique";
import { commentReactionsAnon } from "./0003-comment-reactions-anon";
import { cardGameDays } from "./0004-card-game-days";
import { treeTitles } from "./0005-tree-titles";
import { treeTitleWords } from "./0006-tree-title-words";
import { treeTitleHidden } from "./0007-tree-title-hidden";
import { treeTiers } from "./0008-tree-tiers";
import { treeTierGlow } from "./0009-tree-tier-glow";
import { treeDropUncommonTier } from "./0010-tree-drop-uncommon-tier";
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
export const MIGRATIONS: Migration[] = [
  baseline,
  commentReactionsUnique,
  commentReactionsAnon,
  cardGameDays,
  treeTitles,
  treeTitleWords,
  treeTitleHidden,
  treeTiers,
  treeTierGlow,
  treeDropUncommonTier,
];
