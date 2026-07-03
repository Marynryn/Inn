import type { RouterConfig } from 'nuxt/schema'
import { smoothScrollTo } from './utils/smoothScroll'

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

    if (to.hash && import.meta.client) {
      // Ждём кадр, чтобы новая страница успела отрисоваться, иначе элемент
      // ещё не существует в DOM — затем плавно скроллим к нему сами.
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          const el = document.querySelector(to.hash)
          if (!el) {
            resolve({ el: to.hash, top: 64 })
            return
          }
          const top = el.getBoundingClientRect().top + window.scrollY - 64
          smoothScrollTo(top).then(() => resolve(false))
        })
      })
    }

    return { top: 0 }
  },
}
