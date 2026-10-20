import type { RouterConfig } from 'nuxt/schema'
// Не из общего '#app': он тянет все композаблы, среди них layout.js, а тот
// ждёт route-rules.mjs, который с Nuxt 4.5 сам импортирует этот файл. Кольцо
// импортов роняло приложение в браузере при запуске.
import { useNuxtApp } from '#app/nuxt'
import { START_LOCATION } from 'vue-router'
import { smoothScrollTo } from './utils/smoothScroll'
import { takePageScrollClaim } from './utils/pageScroll'

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

    // Переход на другую страницу: прокручиваем, только когда Nuxt её показал.
    // Иначе наверх сначала уезжает старая страница — например, глава, из которой
    // переходят стрелкой, — и лишь потом её текст сменяется новым. Так же
    // ждёт и стандартное поведение Nuxt, которое этот файл заменяет.
    if (!to.hash && to.path !== from.path && from !== START_LOCATION && import.meta.client) {
      const nuxtApp = useNuxtApp()
      return new Promise((resolve) => {
        // Без ожидания кадра: страница уже в DOM, и кадр новой главы, ещё
        // прокрученной до низа старой, успел бы мелькнуть.
        nuxtApp.hooks.hookOnce('page:loading:end', () => {
          // Пока грузилось, ушли дальше — эту прокрутку уже не делаем.
          if (nuxtApp.$router.currentRoute.value.fullPath !== to.fullPath) return resolve(false)
          // Глава уже сама вернулась к закладке — наверх её не увозим.
          if (takePageScrollClaim(to.path)) return resolve(false)
          resolve(savedPosition ?? { top: 0 })
        })
      })
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
