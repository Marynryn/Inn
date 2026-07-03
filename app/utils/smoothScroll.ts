const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export function smoothScrollTo(top: number, duration = 700): Promise<void> {
  return new Promise((resolve) => {
    const startY = window.scrollY
    const diff = top - startY
    if (Math.abs(diff) < 1) {
      resolve()
      return
    }

    const startTime = performance.now()

    const step = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1)
      window.scrollTo(0, startY + diff * easeInOutCubic(t))
      if (t < 1) {
        requestAnimationFrame(step)
      } else {
        resolve()
      }
    }

    requestAnimationFrame(step)
  })
}
