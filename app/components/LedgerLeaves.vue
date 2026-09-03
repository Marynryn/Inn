<script setup lang="ts">
// СЕЙЧАС НЕ ПОДКЛЮЧЁН. Листопад по бокам оглавления: отложен, но сохранён.
// Чтобы вернуть, поставить <LedgerLeaves /> внутрь .parchment-band в index.vue.
//
// Листья импортируются, а не пишутся адресами: так Vite прогоняет их через
// сборку и выдаёт хэшированные ссылки в /_nuxt/, где стоит вечный кэш. Те же
// файлы в public/ попали бы под no-store и качались заново каждый визит.
// Импортируются только те окрасы, что стоят в россыпи: невостребованные
// файлы Vite в сборку не кладёт, и лишний вес на страницу не попадает.
// Остальные лежат в assets на случай перебора цветов.
import mapleRed from '~/assets/leaves/maple-red.svg'
import mapleAmber from '~/assets/leaves/maple-amber.svg'
import mapleYellow from '~/assets/leaves/maple-yellow.svg'
import mapleLime from '~/assets/leaves/maple-lime.svg'
import mapleGreen from '~/assets/leaves/maple-green.svg'
import oakYellow from '~/assets/leaves/oak-yellow.svg'
import oakLime from '~/assets/leaves/oak-lime.svg'

type Leaf = {
  src: string
  /** доля ширины поля */
  x: number
  /** размер в пикселях — им и задаётся глубина */
  size: number
  opacity: number
  /** размах покачивания */
  sway: number
  /** полный круг падения, секунды */
  dur: number
  /** отрицательный сдвиг: лист стартует уже в пути, чтобы они не шли строем */
  delay: number
}

// Листья держатся приглушёнными, чтобы не спорить с текстом рядом. Глубину
// при этом задаёт размер, а не бледность: на пергаменте совсем бледный лист
// теряет форму и читается разводом, поэтому ниже 0.5 опускать не стоит.
const LEFT: Leaf[] = [
  { src: mapleRed,    x: 10, size: 44, opacity: .85, sway: 22, dur: 39, delay: -6 },
  { src: mapleGreen,  x: 33, size: 38, opacity: .80, sway: 19, dur: 57, delay: -12 },
  { src: oakYellow,   x: 55, size: 24, opacity: .72, sway: 12, dur: 54, delay: -24 },
  { src: mapleYellow, x: 75, size: 32, opacity: .82, sway: 16, dur: 52, delay: -33 },
  { src: mapleLime,   x: 93, size: 21, opacity: .76, sway: 11, dur: 50, delay: -40 },
]

const RIGHT: Leaf[] = [
  { src: mapleAmber,  x: 7,  size: 29, opacity: .80, sway: 15, dur: 40, delay: -14 },
  { src: mapleLime,   x: 29, size: 40, opacity: .82, sway: 20, dur: 55, delay: -9 },
  { src: mapleGreen,  x: 51, size: 23, opacity: .80, sway: 12, dur: 58, delay: -21 },
  { src: mapleRed,    x: 72, size: 34, opacity: .85, sway: 17, dur: 44, delay: -38 },
  { src: oakLime,     x: 91, size: 26, opacity: .72, sway: 13, dur: 45, delay: -45 },
]

const root = ref<HTMLElement | null>(null)

/** ширина колонки с содержимым — от неё отмеряются поля по бокам */
const CONTENT = 720
/** уже этого поле не вмещает даже мелкий лист */
const MIN_GUTTER = 56
/** поле, при котором листья идут в полный размер */
const FULL_GUTTER = 140

// Меряем живой размер полосы, а не спрашиваем ширину окна. Медиазапрос тут
// врал: при системном масштабе Windows 125–150% окно отдаёт браузеру заметно
// меньше пикселей, чем есть у экрана, и листья пропадали на ровном месте.
const bandWidth = ref(0)
const bandHeight = ref(0)
let ro: ResizeObserver | null = null

const gutter = computed(() => Math.max(0, (bandWidth.value - CONTENT) / 2))
const visible = computed(() => gutter.value >= MIN_GUTTER)

// В тесном поле лист ужимается, чтобы не обрезаться о край колонки
const scale = computed(() =>
  Math.min(1, Math.max(0.55, gutter.value / FULL_GUTTER)))

// Длина падения — по живой высоте полосы: она растёт вместе с числом томов,
// и на фиксированной длине листья исчезали бы на середине оглавления.
const fallHeight = computed(() => bandHeight.value + 140)

onMounted(() => {
  const el = root.value
  if (!el) return
  ro = new ResizeObserver(() => {
    bandWidth.value = el.offsetWidth
    bandHeight.value = el.offsetHeight
  })
  ro.observe(el)
  bandWidth.value = el.offsetWidth
  bandHeight.value = el.offsetHeight
})

onUnmounted(() => ro?.disconnect())

const style = (l: Leaf) => ({
  left: `${l.x}%`,
  opacity: l.opacity,
  '--dur': `${l.dur}s`,
  '--delay': `${l.delay}s`,
})

const sized = (l: Leaf) => Math.round(l.size * scale.value)

const swayStyle = (l: Leaf) => ({
  '--sway': `${l.sway}px`,
  '--sway-dur': `${(l.dur / 4).toFixed(1)}s`,
})
</script>

<template>
  <!-- Пустая обёртка рисуется всегда: по ней и меряются поля. Сами листья
       появляются внутри, только когда места хватает, — на узком экране
       браузеру нечего и грузить. -->
  <div
    ref="root"
    class="leaves"
    :style="{ '--fall-height': `${fallHeight}px` }"
    aria-hidden="true"
  >
    <template v-if="visible">
      <div class="leaf-col col-left">
        <span v-for="(l, i) in LEFT" :key="`l${i}`" class="fall" :style="style(l)">
          <span class="sway" :style="swayStyle(l)">
            <img :src="l.src" alt="" :width="sized(l)" :height="sized(l)" loading="lazy" decoding="async">
          </span>
        </span>
      </div>

      <div class="leaf-col col-right">
        <span v-for="(l, i) in RIGHT" :key="`r${i}`" class="fall" :style="style(l)">
          <span class="sway" :style="swayStyle(l)">
            <img :src="l.src" alt="" :width="sized(l)" :height="sized(l)" loading="lazy" decoding="async">
          </span>
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.leaves {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

/* Поля отмеряются не от блока в 760 px, а от его содержимого: у блоков
   по 20 px падинга, и по краю коробки листья обрезались бы, не доходя
   до самого текста. 720 — это ширина содержимого. */
.leaf-col {
  position: absolute;
  top: 0;
  bottom: 0;
  width: calc((100% - 720px) / 2);
  overflow: hidden;
}

.col-left {
  left: 0;
}

.col-right {
  right: 0;
}

.fall {
  position: absolute;
  top: -90px;
  animation: leaf-fall var(--dur) linear var(--delay) infinite;
}

.sway {
  display: block;
  animation: leaf-sway var(--sway-dur) ease-in-out infinite alternate;
}

.fall img {
  display: block;
  height: auto;
}

@keyframes leaf-fall {
  from { transform: translateY(0); }
  to   { transform: translateY(var(--fall-height)); }
}

/* Качание отдельным слоем поверх падения: иначе одно преобразование
   затирало бы другое. */
@keyframes leaf-sway {
  from { transform: translateX(calc(var(--sway) * -1)) rotate(-22deg); }
  to   { transform: translateX(var(--sway)) rotate(26deg); }
}

@media (prefers-reduced-motion: reduce) {
  .fall,
  .sway {
    animation: none !important;
  }

  .fall:nth-child(odd)  { top: 18%; }
  .fall:nth-child(even) { top: 62%; }
}
</style>
