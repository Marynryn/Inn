// app/composables/useChapterList.ts
export const useChapterList = () =>
  useFetch("/api/chapters", {
    key: "chapters-toc",
    transform: (list: any[]) =>
      list.map(({ id, volume, title, publishedAt, sortOrder, wordCount }) => ({
        id,
        volume,
        title,
        publishedAt,
        sortOrder,
        wordCount,
      })),
    default: () => [],
  });
