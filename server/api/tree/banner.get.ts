import type { TreeBannerData } from "#shared/utils/tree";
import { treeBoard, treeFor } from "../../utils/tree";

/**
 * Ёлка на главной: тексты баннера и доска титулов. Гостям тоже — доска и
 * есть то, что зовёт войти и потрясти. Ёлка «только для админов» видна только
 * админам; ёлки нет — null, и на главной остаётся плашка игры.
 */
export default defineEventHandler(
  async (event): Promise<TreeBannerData | null> => {
    const session = await getUserSession(event);
    const tree = await treeFor(
      (session.user as { role?: string } | undefined)?.role,
    );
    if (!tree) return null;
    return { texts: tree.texts, board: await treeBoard(tree.mode) };
  },
);
