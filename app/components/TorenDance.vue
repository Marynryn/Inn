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

onMounted(async () => {
  const [{ default: lottie }, { default: data }] = await Promise.all([
    import('lottie-web/build/player/lottie_light'),
    import('~/assets/halloween/toren.json'),
  ])
  if (!box.value) return

  // Кремовые кости на пергаменте почти пропадают — им нужен контур. Обводить
  // всю картинку нельзя: оранжевые мыши и звёзды вокруг тоже получили бы рамку.
  // Поэтому слоям-костям даём класс, и контур в стилях ложится только на них.
  // Слои «PRINT» — это мыши и звёзды.
  const json = structuredClone(data) as { layers: { nm: string; cl?: string }[] }
  for (const layer of json.layers) {
    if (!layer.nm.startsWith('PRINT')) layer.cl = 'bone'
  }

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const a = lottie.loadAnimation({
    container: box.value,
    renderer: 'svg',
    loop: true,
    autoplay: !still,
    animationData: json,
  })
  // «Меньше движения» — Торен стоит в одной позе, а не исчезает.
  if (still) a.addEventListener('DOMLoaded', () => a.goToAndStop(40, true))
  anim = a
})

onBeforeUnmount(() => anim?.destroy())
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

/* Два тонких прохода чернильного цвета дают сплошную линию по краю кости,
   третий, мягкий, — лёгкую тень, чтобы фигура не казалась наклеенной. */
.toren :deep(.bone) {
  filter:
    drop-shadow(0 0 .6px #4a3a2c)
    drop-shadow(0 0 .6px #4a3a2c)
    drop-shadow(0 1px 1px rgba(59, 47, 37, .35));
}
</style>
