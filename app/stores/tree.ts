import type { BoardEntry, NameTitle, TreeBannerData } from "#shared/utils/tree";
import { TREE_BOARD_RARE, TREE_BOARD_RECENT } from "#shared/utils/tree";

/**
 * Ёлка на главной: тексты баннера и доска титулов. Грузится один раз с
 * главной; дальше окно ёлки само дописывает в доску то, что выпало, — сервер
 * отдаёт готовую строку в ответе встряски. Прежде после каждой встряски
 * главная заново тянула всю доску (~40 КБ), хотя менялась одна строка.
 *
 * Чужие встряски видны при следующем заходе на главную.
 */
export const useTreeStore = defineStore("tree", () => {
  const banner = ref<TreeBannerData | null>(null);

  /** Загрузить баннер. На сервере — с кукой читателя: ёлка «только для
   *  админов» видна лишь им. Сбой — не беда: главная покажет плашку игры. */
  async function load() {
    const fetch = useRequestFetch();
    banner.value = await fetch<TreeBannerData | null>(
      "/api/tree/banner" as string,
    ).catch(() => null);
  }

  const isPinned = (e: BoardEntry) =>
    Boolean(e.tier && banner.value?.board.pinned.includes(e.tier.id));

  /** Поставить строку в часть доски — по порядку, свежие сверху. */
  const placeIn = (list: BoardEntry[], e: BoardEntry, max: number) => {
    const rest = list.filter((x) => x.id !== e.id);
    const at = rest.findIndex((x) => x.id < e.id);
    rest.splice(at < 0 ? rest.length : at, 0, e);
    return rest.slice(0, max);
  };

  /** Свежий титул — на доску: в свежие и, если его редкость сверху, наверх. */
  function addEntry(e: BoardEntry) {
    const board = banner.value?.board;
    if (!board) return;
    board.recent = placeIn(board.recent, e, TREE_BOARD_RECENT);
    if (isPinned(e)) board.rare = placeIn(board.rare, e, TREE_BOARD_RARE);
  }

  /** Титул поменялся — в него взяли одно слово: поправить его строку. С
   *  новой редкостью он может подняться наверх доски или уйти оттуда. */
  function patchTitle(title: NameTitle) {
    const board = banner.value?.board;
    if (!board) return;
    const old =
      board.recent.find((e) => e.id === title.id) ??
      board.rare.find((e) => e.id === title.id);
    if (!old) return;
    const e: BoardEntry = { ...old, ...title };
    board.recent = board.recent.map((x) => (x.id === e.id ? e : x));
    board.rare = isPinned(e)
      ? placeIn(board.rare, e, TREE_BOARD_RARE)
      : board.rare.filter((x) => x.id !== e.id);
  }

  return { banner, load, addEntry, patchTitle };
});
