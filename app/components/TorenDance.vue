<script setup lang="ts">
/**
 * Торен на Хеллоуин — встаёт у оглавления на место Аписты. Анимация «Death Dance»
 * с LottieFiles (автор jignesh gajjar, Lottie Simple License).
 *
 * Проигрыватель и сама анимация грузятся отдельным куском только тогда, когда
 * Торен на странице, — в обычное время сайт их не скачивает.
 */
const box = ref<HTMLElement | null>(null)
let anim: { destroy: () => void } | null = null
let observer: IntersectionObserver | null = null

type LottieShape = { ty: string; it?: LottieShape[]; c?: { k: number[] } }
type LottieLayer = { nm: string; shapes?: LottieShape[] }

// Толщина в единицах кадра анимации (1100×1100): на экране Торен в 96–150 px,
// и снаружи заливки остаётся около полупикселя-пикселя линии.
const OUTLINE = { ty: 'st', nm: 'Outline', c: { a: 0, k: [0.29, 0.227, 0.173, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 7 }, lc: 2, lj: 2, ml: 4, bm: 0 }

/** Кость — светлая заливка; после неё в группе ставим обводку (раньше по списку — выше на рисунке). */
function outlineBones(items: LottieShape[] | undefined) {
  if (!items) return
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!
    if (item.it) outlineBones(item.it)
    const [r = 0, g = 0, b = 0] = item.ty === 'fl' ? item.c?.k ?? [] : []
    if (item.ty === 'fl' && r + g + b > 2.2) items.splice(i + 1, 0, structuredClone(OUTLINE))
  }
}

onMounted(async () => {
  const [{ default: lottie }, { default: data }] = await Promise.all([
    import('lottie-web/build/player/lottie_light'),
    import('~/assets/halloween/toren.json'),
  ])
  if (!box.value) return

  // Кремовые кости на пергаменте почти пропадают — им нужен контур. Раньше его
  // давали CSS-тени на слоях, но фильтр заново растеризует слой на каждом кадре
  // анимации, и на телефоне от этого дёргалась прокрутка. Теперь контур рисует
  // сам проигрыватель: каждой светлой заливке — обводка чернильного цвета. Она
  // стоит под заливкой, поэтому видна только её внешняя половина. Тёмные
  // глазницы и цветные мыши со звёздами (слои «PRINT») обводки не получают.
  const json = structuredClone(data) as { layers: LottieLayer[] }
  for (const layer of json.layers) {
    if (!layer.nm.startsWith('PRINT')) outlineBones(layer.shapes)
  }

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const a = lottie.loadAnimation({
    container: box.value,
    renderer: 'svg',
    loop: true,
    autoplay: !still,
    animationData: json,
  })
  // Анимация нарисована по 30 кадров в секунду, а проигрыватель по умолчанию
  // пересчитывает скелет на каждом кадре экрана — вдвое чаще, чем видно глазу.
  // На телефоне эта лишняя работа шла в одном потоке с прокруткой, и та дёргалась.
  a.setSubframe(false)
  // «Меньше движения» — Торен стоит в одной позе, а не исчезает.
  if (still) a.addEventListener('DOMLoaded', () => a.goToAndStop(40, true))
  anim = a

  // За экраном Торена никто не видит — и пересчитывать его незачем.
  if (!still) {
    observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) a.play()
      else a.pause()
    })
    observer.observe(box.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  anim?.destroy()
})
</script>

<template>
  <div ref="box" class="toren" role="img" aria-label="Торен" title="Торен" />
</template>

<style scoped>
/* Скелет занимает середину квадрата, вокруг — поле для мышей и звёзд, поэтому
   квадрат крупнее Аписты: сама фигура выходит с неё ростом. */
.toren {
  width: var(--toren-w, 150px);
  height: var(--toren-w, 150px);
  pointer-events: none;
}
</style>
