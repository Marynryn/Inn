export const useProgressGuard = (
  chapter: Ref<{ id: string; title: string } | null>,
  allChapters: Ref<any[] | null>,
) => {
  const { lastRead, setLastRead, load, synced } = useReadProgress()
  const auth = useAuthStore()
  const showProgressModal = ref(false)

  const waitFor = (cond: () => boolean, ms: number) => new Promise<void>((resolve) => {
    if (cond()) return resolve()
    const timer = setTimeout(done, ms)
    const stop = watch(cond, (v) => { if (v) done() })
    function done() { clearTimeout(timer); stop(); resolve() }
  })

  let alive = true
  onUnmounted(() => { alive = false })

  onMounted(async () => {
    if(!chapter.value){return}
    const current = { id: chapter.value.id, title: chapter.value.title }

    // Закладку из браузера читаем сами: страница делает это в своём onMounted,
    // а он идёт позже нашего. При открытии главы прямой ссылкой закладка в этот
    // момент была ещё пустой, и мы молча затирали её текущей главой.
    load()

    // В браузере закладки нет — у вошедшего она может быть на сервере (другое
    // устройство). Ждём его ответа, но недолго: без сети глава всё равно читается.
    if(!lastRead.value){
      await waitFor(() => auth.ready, 5000)
      if(auth.isAuthed){await waitFor(() => synced.value, 5000)}
      if(!alive){return}
    }

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
