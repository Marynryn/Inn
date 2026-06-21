const parseId = (id: string) => {
  const [vol, rest = '0'] = id.split('.')
  return { vol: parseInt(vol) || 0, ch: parseFloat(rest) || 0 }
}

const byNumber = (a: any, b: any) => {
  const pa = parseId(a.id)
  const pb = parseId(b.id)
  if(pa.vol !== pb.vol){return pa.vol - pb.vol}
  return pa.ch - pb.ch
}

export const useChapterNav = (chapterId: string, allChapters: Ref<any[] | null>) => {
  const sorted = computed(() =>
    [...(allChapters.value ?? [])].sort(byNumber)
  )

  const currentIndex = computed(() =>
    sorted.value.findIndex(c => c.id === chapterId)
  )

  const prevChapter = computed(() => sorted.value[currentIndex.value - 1] ?? null)
  const nextChapter = computed(() => sorted.value[currentIndex.value + 1] ?? null)

  return { prevChapter, nextChapter }
}
