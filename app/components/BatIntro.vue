<script setup lang="ts">
/**
 * Хеллоуинская заставка: сплошная темнота распадается на силуэты летучих
 * мышей, и они разлетаются вглубь, открывая страницу. Около полутора секунд.
 *
 * Анимация — «batstransitons» (Diego PerMar, LottieFiles, Lottie Simple
 * License). В исходнике стая слетается в черноту; мы проигрываем её задом
 * наперёд — чернота рассыпается.
 *
 * Показывается и при загрузке, и при каждом переходе на главную или в
 * главу: страница вешает компонент с ключом по адресу. Чёрный экран приходит
 * в HTML и гаснет по CSS-таймеру сам — даже если скрипты или анимация не
 * загрузились, страница чёрной не останется. Проигрыватель и анимация
 * грузятся отдельным куском только здесь, и только раз за визит.
 */

const shown = ref(true)
const done = ref(false)
const root = ref<HTMLElement | null>(null)
const dark = ref<HTMLElement | null>(null)
const box = ref<HTMLElement | null>(null)

/** С этого кадра и начинаем. Кадры 37–53 исходника сплошь чёрные, мыши
 *  проступают с 36-го; оставляем пару чёрных кадров для стыка с подложкой,
 *  а остальные ~0,4 с темноты пропускаем. */
const START = 39
/** Дольше этого анимацию не ждём: медленная сеть — пусть лучше без мышей,
 *  чем пару секунд смотреть в чёрный экран. */
const MAX_WAIT = 2000
/** Исходник длится 1,8 с; чуть ускоряем, чтобы заставка не задерживала. */
const SPEED = 1.2

let anim: { destroy: () => void } | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let giveUp: ReturnType<typeof setTimeout> | null = null

const close = (delay: number) => {
  if (done.value) return
  done.value = true
  timer = setTimeout(() => { shown.value = false }, delay)
}

// Клик или клавиша — сразу к странице.
const skip = () => {
  if (done.value) return
  for (const el of [box.value, dark.value]) {
    el?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' })
  }
  close(220)
}

onMounted(async () => {
  window.addEventListener('keydown', skip, { once: true })
  // Скрипты ожили — CSS-страховка больше не нужна, сроки держим отсюда:
  // иначе на медленной сети она гасила бы мышей посреди полёта. Если же она
  // уже начала гасить темноту, страница опоздала — заставку просто убираем.
  if (root.value) {
    if (getComputedStyle(root.value).opacity !== '1') return close(0)
    root.value.style.animation = 'none'
  }
  giveUp = setTimeout(skip, MAX_WAIT)

  const [{ default: lottie }, { default: data }] = await Promise.all([
    import('lottie-web/build/player/lottie_light'),
    import('~/assets/halloween/bats.json'),
  ])
  if (!box.value || done.value) return

  const a = lottie.loadAnimation({
    container: box.value,
    renderer: 'svg',
    loop: false,
    autoplay: false,
    animationData: structuredClone(data),
    // Растягиваем на весь экран с обрезкой, а не вписываем: иначе по краям
    // остались бы пустые полосы и чернота не была бы сплошной.
    rendererSettings: { preserveAspectRatio: 'xMidYMid slice' },
  })
  anim = a
  a.setSpeed(SPEED)
  a.addEventListener('complete', () => close(0))

  // Первый кадр анимации такой же чёрный, как подложка, — подложку убираем,
  // как только анимация нарисовалась: дальше темноту держит она сама.
  a.addEventListener('DOMLoaded', () => {
    if (giveUp) clearTimeout(giveUp)
    if (done.value) return
    if (dark.value) dark.value.style.opacity = '0'
    a.playSegments([START, 0], true)
  })
})

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
  if (giveUp) clearTimeout(giveUp)
  anim?.destroy()
  if (import.meta.client) window.removeEventListener('keydown', skip)
})
</script>

<template>
  <div
    v-if="shown"
    ref="root"
    class="bat-intro"
    aria-hidden="true"
    @click="skip"
    @touchmove.prevent
    @wheel.prevent
  >
    <div ref="dark" class="bat-intro-dark" />
    <div ref="box" class="bat-intro-anim" />
  </div>
</template>

<style scoped>
.bat-intro {
  position: fixed;
  inset: 0;
  z-index: var(--z-intro);
  overflow: hidden;
  cursor: pointer;
  /* Свайп по заставке не должен листать страницу под ней: на телефоне от этого
     прячется адресная строка, экран меняет высоту, и мыши дёргаются вслед.
     CSS держит страницу ещё до скриптов, обработчики в шаблоне — для тех
     браузеров, что touch-action на прокрутку страницы не распространяют. */
  touch-action: none;
  overscroll-behavior: none;
  /* Страховка: не загрузились анимация или скрипты — через несколько секунд
     темнота уходит сама, и страница доступна. */
  animation: intro-fallback .6s ease 3s forwards;
}

/* Темнота до того, как загрузилась анимация. */
.bat-intro-dark {
  position: absolute;
  inset: 0;
  background: #000;
}

.bat-intro-anim {
  position: absolute;
  inset: 0;
  /* Цвет мышей в исходнике задан эффектом, которого лёгкий проигрыватель не
     понимает, — без фильтра они белые. Фильтр делает всё нарисованное
     чёрным, прозрачное остаётся прозрачным. */
  filter: brightness(0);
}

@keyframes intro-fallback {
  to { opacity: 0; visibility: hidden; pointer-events: none; }
}

/* Кому движение мешает — заставки нет вовсе. */
@media (prefers-reduced-motion: reduce) {
  .bat-intro { display: none; }
}
</style>
