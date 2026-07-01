const NEW_DAYS = 3

const parseChapterId = (id: string) => {
  const [vol, rest = '0'] = id.split('.')
  return { vol: parseInt(vol) || 0, ch: parseFloat(rest) || 0 }
}

const byChapterOrder = (a: any, b: any) => {
  const pa = parseChapterId(a.id)
  const pb = parseChapterId(b.id)
  if(pa.vol !== pb.vol){return pa.vol - pb.vol}
  return pa.ch - pb.ch
}

export const pluralize = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10
  const mod100 = n % 100
  if(mod100 >= 11 && mod100 <= 14){return many}
  if(mod10 === 1){return one}
  if(mod10 >= 2 && mod10 <= 4){return few}
  return many
}

export const useVolumes = (chapters: Ref<any[] | null>) => {
  const { isRead } = useReadProgress()

  const volumes = computed(() => {
    const map = new Map<number, any[]>()
    for (const ch of chapters.value ?? []) {
      if(!map.has(ch.volume)){map.set(ch.volume, [])}
      map.get(ch.volume)!.push(ch)
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  })

  const totalChapters = computed(() => chapters.value?.length ?? 0)

  const chaptersLabel = computed(() => {
    const n = totalChapters.value
    return `${n} ${pluralize(n, 'глава', 'главы', 'глав')}`
  })

  const chapterRange = computed(() => {
    if(!chapters.value?.length){return '—'}
    const sorted = [...chapters.value].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    return `${sorted[0].id}–${sorted[sorted.length - 1].id}`
  })

  const getBadge = (ch: any): 'new' | 'read' | null => {
    if(isRead(ch.id)){return 'read'}
    const days = (Date.now() - new Date(ch.publishedAt).getTime()) / 86_400_000
    return days <= NEW_DAYS ? 'new' : null
  }

  return { volumes, totalChapters, chaptersLabel, chapterRange, getBadge }
}
