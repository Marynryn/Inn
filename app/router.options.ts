import type { RouterConfig } from 'nuxt/schema'
// Не из общего '#app': он тянет все композаблы, среди них layout.js, а тот
// ждёт route-rules.mjs, который с Nuxt 4.5 сам импортирует этот файл. Кольцо
// импортов роняло приложение в браузере при запуске.
import { useNuxtApp } from '#app/nuxt'
import { smoothScrollTo } from './utils/smoothScroll'

const SCROLL_PREFIX = 'tavern:scroll:'

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    if (import.meta.client && to.path.startsWith('/chapter/')) {
      const id = String(to.params.id).replace('-', '.')
      const raw = localStorage.getItem(SCROLL_PREFIX + id)
      if (raw && parseFloat(raw) > 0.02) {
        return false
      }
    }

    if (savedPosition) return savedPosition

    if (to.hash && import.meta.client) {
      // Новая страница ещё грузит данные (await useFetch) и не отрисована —
      // ждём, пока Nuxt её покажет, иначе элемента нет в DOM. На той же
      // странице ждать нечего: page:finish не придёт, хватит кадра.
      const nuxtApp = useNuxtApp()
      return new Promise((resolve) => {
        const ready = (cb: () => void) => to.path === from.path
          ? requestAnimationFrame(cb)
          : nuxtApp.hooks.hookOnce('page:finish', () => requestAnimationFrame(cb))
        ready(() => {
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
