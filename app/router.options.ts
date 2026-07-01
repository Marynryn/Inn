import type { RouterConfig } from 'nuxt/schema'

const SCROLL_PREFIX = 'tavern:scroll:'

export default <RouterConfig>{
  scrollBehavior(to, _from, savedPosition) {
    if (import.meta.client && to.path.startsWith('/chapter/')) {
      const id = String(to.params.id).replace('-', '.')
      const raw = localStorage.getItem(SCROLL_PREFIX + id)
      if (raw && parseFloat(raw) > 0.02) {
        return false
      }
    }

    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, top: 64, behavior: 'smooth' }
    return { top: 0 }
  },
}
