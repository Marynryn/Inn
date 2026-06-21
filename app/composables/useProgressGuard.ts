export const useProgressGuard = (
  chapter: Ref<{ id: string; title: string } | null>,
  allChapters: Ref<any[] | null>,
) => {
  const { lastRead, setLastRead } = useReadProgress()
  const showProgressModal = ref(false)

  onMounted(() => {
    if(!chapter.value){return}
    const current = { id: chapter.value.id, title: chapter.value.title }

    if(!lastRead.value || !allChapters.value){
      setLastRead(current)
      return
    }

    const sorted = [...allChapters.value].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const lastIdx = sorted.findIndex(c => c.id === lastRead.value!.id)
    const currIdx = sorted.findIndex(c => c.id === chapter.value!.id)

    if(currIdx < lastIdx){
      showProgressModal.value = true
      return
    }

    setLastRead(current)
  })

  const confirmProgressUpdate = () => {
    if(!chapter.value){return}
    setLastRead({ id: chapter.value.id, title: chapter.value.title })
    showProgressModal.value = false
  }

  const keepProgress = () => {
    showProgressModal.value = false
  }

  return { lastRead, showProgressModal, confirmProgressUpdate, keepProgress }
}
