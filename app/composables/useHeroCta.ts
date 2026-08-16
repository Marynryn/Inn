export const useHeroCta = (chapters: Ref<any[] | null>) => {
  const { lastRead } = useReadProgress()

  const ctaHref = computed(() => {
    if(lastRead.value){return `/chapter/${encodeURIComponent(lastRead.value.id.replace('.', '-'))}`}
    const first = [...(chapters.value ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0]
    return first ? `/chapter/${encodeURIComponent(first.id.replace('.', '-'))}` : '#'
  })

  const ctaText = computed(() =>
    lastRead.value ? `Продолжить главу ${lastRead.value.id}` : 'Читать с начала'
  )

  return { ctaHref, ctaText }
}
