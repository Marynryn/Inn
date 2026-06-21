export const useReadMarker = (chapterId: string) => {
  const { isRead, markRead } = useReadProgress()

  const alreadyMarked = computed(() => isRead(chapterId))
  const showReadMarker = ref(false)

  const onScroll = () => {
    if(alreadyMarked.value){return}
    if(window.innerHeight + window.scrollY < document.body.offsetHeight - 40){return}
    markRead(chapterId)
    showReadMarker.value = true
    window.removeEventListener('scroll', onScroll)
  }

  onMounted(() => {
    if(alreadyMarked.value){
      showReadMarker.value = true
      return
    }
    window.addEventListener('scroll', onScroll)
  })

  onUnmounted(() => window.removeEventListener('scroll', onScroll))

  return { showReadMarker }
}
