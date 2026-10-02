// До гидрации кнопка всегда гостевая, как её нарисовал сервер: закладка с
// сервера может прийти раньше, чем страница оживёт, и тогда сборка Vue оставила
// бы серверную ссылку под новым текстом. Пока hydrated ложно — закладки нет.
export const useHeroCta = (chapters: Ref<any[] | null>, hydrated: Ref<boolean>) => {
  const { lastRead: stored } = useReadProgress()
  const lastRead = computed(() => (hydrated.value ? stored.value : null))

  const ctaHref = computed(() => {
    if(lastRead.value){return `/chapter/${encodeURIComponent(slugifyChapterId(lastRead.value.id))}`}
    const first = [...(chapters.value ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0]
    return first ? `/chapter/${encodeURIComponent(slugifyChapterId(first.id))}` : '#'
  })

  const ctaText = computed(() =>
    lastRead.value ? `Продолжить главу ${lastRead.value.id}` : 'Читать с начала'
  )

  return { ctaHref, ctaText }
}
