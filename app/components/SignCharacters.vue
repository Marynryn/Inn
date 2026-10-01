<script setup lang="ts">
/**
 * Вывеска «Карточки персонажей» — вход на страницу персонажей с главной.
 * Висит на цепях под нижним краем hero: на широком экране — в пустом поле
 * справа от баннера игры, на узком, где поля нет, — по центру над ним. И там,
 * и там спускается из-под края hero и качается. Анимация повторяется всякий
 * раз, когда вывеска снова видна целиком, — ушла из виду, значит, спустится снова.
 */
// Ссылка — компонент, а следим за её элементом: саму табличку смотреть
// бесполезно, до выезда она спрятана за краем и «не видна» никогда.
const link = ref<{ $el: HTMLElement } | null>(null)
const img = ref<HTMLImageElement | null>(null)
const shown = ref(false)

let observer: IntersectionObserver | null = null
let timer: ReturnType<typeof setTimeout> | null = null

/**
 * Если вывеска видна прямо при открытии страницы, выезд случился бы, пока
 * грузятся картинки и шрифты, — глаз бы его не поймал. Поэтому первый выезд —
 * с паузой, когда страница уже успокоилась; дальше — сразу, как только видно.
 */
const FIRST_DELAY = 900
let first = true

const show = () => {
  if (timer) return
  const wait = first ? FIRST_DELAY : 0
  first = false
  timer = setTimeout(() => {
    timer = null
    shown.value = true
  }, wait)
}

const hide = () => {
  if (timer) clearTimeout(timer)
  timer = null
  shown.value = false
}

// Картинка — главное в вывеске: выезжать пустой рамкой незачем.
const imageReady = () => new Promise<void>((resolve) => {
  const el = img.value
  if (!el || el.complete) return resolve()
  el.addEventListener('load', () => resolve(), { once: true })
  el.addEventListener('error', () => resolve(), { once: true })
})

onMounted(async () => {
  const el = link.value?.$el
  if (!el || typeof IntersectionObserver === 'undefined') {
    shown.value = true
    return
  }
  await imageReady()
  // Выезжает, только когда место вывески видно целиком; уезжает, когда
  // осталось меньше десятой, — так повтор случается и после небольшой
  // прокрутки туда-обратно, а разрыв между порогами не даёт ей дёргаться на
  // границе. «Целиком» — с допуском в пару процентов: дробные пиксели на
  // масштабе экрана не дают ровно единицы.
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.intersectionRatio >= 0.98) show()
      else if (e.intersectionRatio < 0.1) hide()
    }
  }, { threshold: [0, 0.1, 0.98, 1] })
  observer.observe(el)
})

onUnmounted(() => {
  observer?.disconnect()
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <NuxtLink ref="link" to="/characters" class="sign" :class="{ shown }" aria-label="Карточки персонажей">
    <span class="slide">
      <img
        ref="img"
        class="swing"
        src="/sign-characters.webp"
        alt=""
        width="520"
        height="650"
        draggable="false"
      >
    </span>
  </NuxtLink>
</template>

<style scoped>
/* Окно вывески режет всё выше своего верхнего края — поэтому спуск выглядит
   так, будто вывеска выезжает из-под hero. Встаёт посередине пустого поля справа
   от баннера игры: баннер шириной 760 по центру, поле — от его края до края
   экрана (50vw − 380px). Вывеска — до 170px, а на ноутбучных ширинах
   ужимается по полю, но не мельче 110px. Отступ справа — половина того, что
   в поле осталось от вывески. Снизу и слева запас: качаясь, табличка выходит
   за свою ширину. */
.sign {
  --field: calc(50vw - 380px);
  --w: clamp(110px, calc(var(--field) - 40px), 170px);
  --gap: max(16px, calc((var(--field) - var(--w)) / 2));
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
  display: block;
  width: calc(var(--w) + 24px + var(--gap));
  padding: 0 var(--gap) 24px 24px;
  overflow: hidden;
}

.sign:focus-visible {
  outline: 2px solid var(--ember);
  outline-offset: -4px;
}

.slide {
  display: block;
  transform: translateY(-105%);
  transition: transform 1.2s cubic-bezier(.3, 1.3, .5, 1);
}

.sign.shown .slide {
  transform: translateY(0);
}

/*
 * Цепи на картинке длинные, но верхний кусок спрятан за краем окна, под
 * hero: так при выезде и раскачке концы цепей не показываются — цепь уходит
 * вверх с запасом. Спрятано 80 из 650 пикселей картинки — хватает с лихвой:
 * качаясь на 5°, конец цепи опускается пикселей на семь. Отступ в процентах
 * считается от ширины (520), поэтому 80/520.
 *
 * Качается вывеска вокруг той точки, где цепи уходят под край, — не вокруг
 * верха картинки, иначе видимый кусок цепи болтался бы целиком.
 */
.swing {
  display: block;
  width: 100%;
  height: auto;
  margin-top: calc(-80 / 520 * 100%);
  transform-origin: 50% calc(80 / 650 * 100%);
  filter: drop-shadow(0 10px 12px rgba(40, 24, 12, .35));
  user-select: none;
}

.sign.shown .swing {
  animation: swing 2.8s ease-out 1s both;
}

.sign:hover .swing {
  animation: nudge 1.4s ease-out both;
}

@keyframes swing {
  0% { transform: rotate(0); }
  15% { transform: rotate(5deg); }
  35% { transform: rotate(-3.5deg); }
  55% { transform: rotate(2deg); }
  75% { transform: rotate(-1deg); }
  100% { transform: rotate(0); }
}

@keyframes nudge {
  0% { transform: rotate(0); }
  25% { transform: rotate(2.5deg); }
  55% { transform: rotate(-1.5deg); }
  100% { transform: rotate(0); }
}

/* Где сбоку от баннера игры места нет, вывеска висит по центру над ним,
   поменьше, и сдвигает его вниз, а не закрывает. */
@media (max-width: 1040px) {
  .sign {
    position: relative;
    right: auto;
    width: 172px;
    margin: 0 auto -16px;
    padding: 0 24px 24px;
  }

}

@media (prefers-reduced-motion: reduce) {
  .slide,
  .sign.shown .slide {
    transform: none;
    transition: none;
  }

  .sign.shown .swing,
  .sign:hover .swing {
    animation: none;
  }
}
</style>
