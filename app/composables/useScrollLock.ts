export function useScrollLock() {
  let prevOverflow = ''

  onMounted(() => {
    prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  })

  onUnmounted(() => {
    document.body.style.overflow = prevOverflow
  })
}
