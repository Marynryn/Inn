// app/composables/useChapterList.ts
const toToc = (list: any[]) =>
  list.map(({ id, volume, title, publishedAt, sortOrder, wordCount }) => ({
    id,
    volume,
    title,
    publishedAt,
    sortOrder,
    wordCount,
  }));

export const useChapterList = () => {
  const res = useFetch("/api/chapters", {
    key: "chapters-toc",
    transform: toToc,
    default: () => [],
  });
  useAdminDrafts(res.data, toToc);
  return res;
};
