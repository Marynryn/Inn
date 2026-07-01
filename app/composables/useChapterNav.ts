export const useChapterNav = (chapterId: string, allChapters: Ref<any[] | null>) => {
  const sorted = computed(() =>
    [...(allChapters.value ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  )

  const currentIndex = computed(() =>
    sorted.value.findIndex(c => c.id === chapterId)
  )

  const prevChapter = computed(() => sorted.value[currentIndex.value - 1] ?? null)
  const nextChapter = computed(() => sorted.value[currentIndex.value + 1] ?? null)

  return { prevChapter, nextChapter }
}
