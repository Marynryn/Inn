/**
 * Виджет, который уезжает за край, пока страницу ведут вниз, и возвращается,
 * когда ведут вверх. На главе он висит прямо над текстом и мешает читать, а
 * прятать насовсем нельзя — тогда его пришлось бы искать.
 *
 * Одни пороги на все значки в углах: уведомления, настройки вида, полный
 * экран. Иначе они дёргались бы вразнобой.
 *
 * `active` — когда прятать вообще можно: значок уведомлений, например, на
 * месте вне главы и пока открыта его панель. `reset()` возвращает значок на
 * вид и забывает, где была прокрутка, — для смены страницы.
 */
export function useScrollTuck(active: () => boolean = () => true) {
  const tucked = ref(false)

  /** Меньше этого считаем дрожанием пальца, а не прокруткой. */
  const JITTER = 6

  /** Пока не отъехали от начала, значок не убираем: там ещё не читают. */
  const TOP_ZONE = 120

  let lastY = 0

  const onScroll = () => {
    const y = window.scrollY
    const dy = y - lastY

    if (Math.abs(dy) < JITTER) return
    lastY = y

    if (!active()) { tucked.value = false; return }

    tucked.value = dy > 0 && y > TOP_ZONE
  }

  const reset = () => {
    tucked.value = false
    lastY = 0
  }

  onMounted(() => {
    lastY = window.scrollY
    window.addEventListener('scroll', onScroll, { passive: true })
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', onScroll)
  })

  return { tucked, reset }
}
