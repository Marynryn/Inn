export const useReadMarker = (chapterId: string) => {
  const { isRead, markRead } = useReadProgress()

  const alreadyMarked = computed(() => isRead(chapterId))
  // Не решаем один раз в onMounted: закладку из браузера страница читает в
  // своём onMounted, и после F5 он шёл позже нашего — глава казалась
  // непрочитанной, и плашка пропадала. Вычисляемое значение порядку не подвержено.
  const justMarked = ref(false)
  const showReadMarker = computed(() => alreadyMarked.value || justMarked.value)

  const onScroll = () => {
    if(alreadyMarked.value){return}
    if(window.innerHeight + window.scrollY < document.body.offsetHeight - 40){return}
    markRead(chapterId)
    justMarked.value = true
    window.removeEventListener('scroll', onScroll)
  }

  onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))

  onUnmounted(() => window.removeEventListener('scroll', onScroll))

  return { showReadMarker }
}
