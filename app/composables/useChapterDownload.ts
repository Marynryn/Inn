export const useChapterDownload = (chapterId: string) => {
  const state = ref<'idle' | 'loading' | 'done'>('idle')

  const download = async () => {
    if(state.value === 'loading'){return}
    state.value = 'loading'
    try {
      const a = document.createElement('a')
      a.href = `/api/chapters/${chapterId}/download`
      a.click()
      await new Promise(r => setTimeout(r, 800))
      state.value = 'done'
      setTimeout(() => { state.value = 'idle' }, 1800)
    } catch {
      state.value = 'idle'
    }
  }

  return { dlState: state, download }
}

export const useChapterDownloadList = () => {
  const downloading = ref<Set<string>>(new Set())
  const downloaded = ref<Set<string>>(new Set())

  const download = async (e: MouseEvent, id: string) => {
    e.stopPropagation()
    if(downloading.value.has(id)){return}
    downloading.value = new Set([...downloading.value, id])
    try {
      const a = document.createElement('a')
      a.href = `/api/chapters/${id}/download`
      a.click()
      await new Promise(r => setTimeout(r, 800))
      downloaded.value = new Set([...downloaded.value, id])
      setTimeout(() => {
        downloaded.value = new Set([...downloaded.value].filter(x => x !== id))
      }, 1800)
    } finally {
      downloading.value = new Set([...downloading.value].filter(x => x !== id))
    }
  }

  return { downloading, downloaded, download }
}
