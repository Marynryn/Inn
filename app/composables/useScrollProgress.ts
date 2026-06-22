const PREFIX = 'tavern:scroll:'

export const useScrollProgress = (chapterId: string) => {
  const key = PREFIX + chapterId

  const save = () => {
    const h = document.documentElement.scrollHeight - window.innerHeight
    if (h <= 0) return
    localStorage.setItem(key, String((window.scrollY / h).toFixed(4)))
  }

  const getSaved = (): number | null => {
    const raw = localStorage.getItem(key)
    return raw ? parseFloat(raw) : null
  }

  const clear = () => localStorage.removeItem(key)

  return { save, getSaved, clear }
}
