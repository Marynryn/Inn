<script setup lang="ts">
import type { Character, Origin } from '#shared/utils/characters'

const props = defineProps<{
  character: Character
  origin?: Origin | null
}>()

const emit = defineEmits<{
  close: []
  flame: [character: Character]
}>()

const sheetEl = ref<HTMLElement | null>(null)
const portraitEl = ref<HTMLElement | null>(null)
const photoEl = ref<HTMLElement | null>(null)

/**
 * Лист вылетает из карточки: в первом кадре он сжат до размера превью и стоит
 * на его месте, дальше разворачивается туда, где ему положено быть. Закрытие —
 * тот же путь назад. Без исходного прямоугольника (или если анимации выключены
 * в системе) остаётся простое появление из CSS.
 *
 * Тем же путём картинка целиком вырастает из портрета.
 */
const flightFrames = (el: HTMLElement | null, from: Origin | null | undefined): Keyframe[] | null => {
  if (!el || !from) return null
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null

  const rect = el.getBoundingClientRect()
  const dx = from.x + from.width / 2 - (rect.x + rect.width / 2)
  const dy = from.y + from.height / 2 - (rect.y + rect.height / 2)
  const scale = Math.min(from.width / rect.width, from.height / rect.height)
  return [
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.3 },
    { transform: 'none', opacity: 1 },
  ]
}

let closing = false

const close = () => {
  if (closing) return
  const frames = flightFrames(sheetEl.value, props.origin)
  if (!frames) return emit('close')
  closing = true
  sheetEl.value!.animate([...frames].reverse(), { duration: 200, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' })
    .finished.finally(() => emit('close'))
}

/**
 * Картинка целиком поверх листа. Портрет в карточке квадратный, и у высокого
 * рисунка видна только середина — увеличение показывает его без обрезки.
 * Прокрутку страницы уже держит лист, второй замок не нужен.
 */
const photo = ref(false)
let photoFrom: Origin | null = null
let photoClosing = false

/**
 * Увеличение внутри самой картинки — чтобы рассмотреть мелочи: колесо, щипок
 * двумя пальцами или щелчок по рисунку. Пока масштаб больше единицы, картинку
 * можно таскать, но за собственные края она не уходит.
 */
const MIN_ZOOM = 1
const MAX_ZOOM = 6
const CLICK_ZOOM = 2.5

const view = reactive({ scale: MIN_ZOOM, x: 0, y: 0 })
const dragging = ref(false)
const smooth = ref(false) // плавный переход нужен щелчку, а колесу и перетаскиванию мешает

const photoStyle = computed(() => ({ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }))

const resetView = () => {
  view.scale = MIN_ZOOM
  view.x = 0
  view.y = 0
}

/** Сдвиг не больше той части картинки, что свисает за экран: пустых полей не будет. */
const clampPan = () => {
  const el = photoEl.value
  if (!el) return
  const slack = (size: number, screen: number) => Math.max(0, (size * view.scale - screen) / 2)
  const maxX = slack(el.offsetWidth, window.innerWidth)
  const maxY = slack(el.offsetHeight, window.innerHeight)
  view.x = Math.min(maxX, Math.max(-maxX, view.x))
  view.y = Math.min(maxY, Math.max(-maxY, view.y))
}

/** Масштаб вокруг точки экрана: что было под пальцем, под ним и остаётся. */
const zoomAt = (clientX: number, clientY: number, next: number) => {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2
  const u = (clientX - cx - view.x) / view.scale
  const v = (clientY - cy - view.y) / view.scale
  view.scale = scale
  if (scale === MIN_ZOOM) {
    view.x = 0
    view.y = 0
    return
  }
  view.x = clientX - cx - u * scale
  view.y = clientY - cy - v * scale
  clampPan()
}

const onWheel = (e: WheelEvent) => {
  smooth.value = false
  zoomAt(e.clientX, e.clientY, view.scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18))
}

/**
 * Пальцы и мышь — одними и теми же событиями. Два пальца — щипок, один —
 * таскание; если палец не сдвинулся, это щелчок, и он переключает масштаб.
 */
const pointers = new Map<number, { x: number; y: number }>()
let pinchFrom = 0
let pinchScale = MIN_ZOOM
let pressAt = { x: 0, y: 0 }
let moved = false

const onPointerDown = (e: PointerEvent) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  ;(e.target as Element).setPointerCapture?.(e.pointerId)
  smooth.value = false

  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
    pinchFrom = Math.hypot(a.x - b.x, a.y - b.y)
    pinchScale = view.scale
    moved = true
    return
  }
  pressAt = { x: e.clientX, y: e.clientY }
  moved = false
  dragging.value = view.scale > MIN_ZOOM
}

const onPointerMove = (e: PointerEvent) => {
  const prev = pointers.get(e.pointerId)
  if (!prev) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (pointers.size === 2 && pinchFrom) {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinchScale * (Math.hypot(a.x - b.x, a.y - b.y) / pinchFrom))
    return
  }

  if (Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 6) moved = true
  if (!dragging.value) return
  view.x += e.clientX - prev.x
  view.y += e.clientY - prev.y
  clampPan()
}

const onPointerUp = (e: PointerEvent) => {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinchFrom = 0
  dragging.value = false
  if (pointers.size || moved) return

  smooth.value = true
  zoomAt(e.clientX, e.clientY, view.scale > MIN_ZOOM ? MIN_ZOOM : CLICK_ZOOM)
}

const openPhoto = async () => {
  resetView()
  const rect = portraitEl.value?.getBoundingClientRect()
  photoFrom = rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
  photo.value = true
  await nextTick()

  // Картинку целиком браузер тянет только сейчас: пока она не разобрана, её
  // размеров нет и лететь неоткуда — ждём, а фон в это время уже затемнён.
  const img = photoEl.value as HTMLImageElement | null
  if (img && !img.complete) await img.decode().catch(() => {})
  if (!photo.value) return

  const frames = flightFrames(photoEl.value, photoFrom)
  if (frames) photoEl.value!.animate(frames, { duration: 240, easing: 'cubic-bezier(.2, .8, .2, 1)' })
}

const closePhoto = async () => {
  if (photoClosing) return
  // Увеличенная картинка складывается в портрет не из своего масштаба, а из
  // обычного: иначе полёт считается по раздутому размеру и уезжает мимо.
  if (view.scale > MIN_ZOOM) {
    smooth.value = false
    resetView()
    await nextTick()
  }
  const frames = flightFrames(photoEl.value, photoFrom)
  if (!frames) return void (photo.value = false)
  photoClosing = true
  photoEl.value!.animate([...frames].reverse(), { duration: 180, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' })
    .finished.finally(() => {
      photo.value = false
      photoClosing = false
    })
}

const list = (values: string[]) => values.length ? values.join(', ') : '—'

const facts = computed(() => [
  { label: 'Пол', value: props.character.gender || '—' },
  { label: 'Возраст', value: props.character.age || '—' },
  { label: 'Раса', value: list(props.character.species) },
  { label: 'Класс', value: list(props.character.cls) },
  { label: 'Занятие', value: list(props.character.occupation) },
  { label: 'Континент', value: list(props.character.continent) },
  { label: 'Локации', value: list(props.character.locations) },
  { label: 'Появляется', value: `${props.character.volume} том` },
])

const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  // Сначала закрывается картинка — лист под ней остаётся открытым.
  if (photo.value) return closePhoto()
  close()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  const frames = flightFrames(sheetEl.value, props.origin)
  if (frames) {
    sheetEl.value!.classList.add('flying')
    sheetEl.value!.animate(frames, { duration: 320, easing: 'cubic-bezier(.2, .8, .2, 1)' })
  }

  // Картинку целиком тянем заранее, пока читатель смотрит на карточку: иначе
  // при щелчке по портрету она приезжает с опозданием и въезжает рывком.
  // Загрузка ленивая по смыслу — до открытия карточки её никто не начинает.
  if (props.character.full) {
    const ahead = new Image()
    ahead.src = props.character.full
    ahead.decode().catch(() => {})
  }
})
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

useScrollLock()
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click.self="close">
      <div ref="sheetEl" class="sheet" role="dialog" aria-modal="true" :aria-label="character.name" :style="{ '--glow': character.glow }">
        <button class="close" type="button" aria-label="Закрыть" @click="close">×</button>

        <div class="portrait-wrap">
          <button
            v-if="character.image && character.full"
            ref="portraitEl"
            class="portrait zoomable"
            type="button"
            :aria-label="`Показать картинку целиком: ${character.name}`"
            @click="openPhoto"
          >
            <img :src="character.image" :alt="character.name">
            <span class="zoom" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="M15.5 15.5 L21 21M10.5 7.5v6M7.5 10.5h6" />
              </svg>
            </span>
          </button>
          <div v-else class="portrait">
            <img v-if="character.image" :src="character.image" :alt="character.name">
            <div v-else class="placeholder" aria-hidden="true">
              <span class="initial display">{{ character.name.slice(0, 1) }}</span>
            </div>
          </div>
        </div>

        <div class="content thin-scroll">
          <div class="head">
            <div>
              <h2 class="name display">{{ character.name }}</h2>
              <div v-if="character.original !== character.name" class="original">{{ character.original }}</div>
            </div>
            <CharacterFlame :count="character.flames" :lit="character.lit" @toggle="emit('flame', character)" />
          </div>

          <dl class="facts">
            <div v-for="f in facts" :key="f.label" class="fact">
              <dt>{{ f.label }}</dt>
              <dd>{{ f.value }}</dd>
            </div>
          </dl>

          <div v-if="character.description.length" class="description">
            <p v-for="(p, i) in character.description" :key="i">{{ p }}</p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="photo && character.full" class="photo" :style="{ '--glow': character.glow }" @click="closePhoto">
      <img
        ref="photoEl"
        :src="character.full"
        :alt="character.name"
        :class="{ zoomed: view.scale > MIN_ZOOM, dragging, smooth }"
        :style="photoStyle"
        draggable="false"
        @click.stop
        @wheel.prevent="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
      <button class="photo-close" type="button" aria-label="Закрыть картинку" @click.stop="closePhoto">×</button>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(20, 14, 10, .72);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fade-in .15s ease;
}

.sheet {
  position: relative;
  display: grid;
  grid-template-columns: 280px 1fr;
  align-items: center;
  width: min(840px, 100%);
  max-height: calc(100vh - 40px);
  overflow: hidden;
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: var(--radius-md);
  color: var(--parchment);
  /* Тень листа светится цветом расы (--glow приходит с карточкой): гоблины
     зелёным, нежить фиолетовым, люди золотым. */
  box-shadow:
    0 30px 60px -30px rgba(0, 0, 0, .9),
    0 0 90px -10px color-mix(in srgb, var(--glow) 70%, transparent),
    0 0 0 1px color-mix(in srgb, var(--glow) 35%, transparent);
  animation: slide-up .22s ease;
  transform-origin: center;
}

/* Когда лист летит из карточки, CSS-появление не нужно — оно бы наложилось. */
.sheet.flying {
  animation: none;
}

.close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(31, 24, 19, .7);
  color: var(--parchment-2);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.close:hover {
  color: var(--ember-soft);
}

/* Портрет — как карточка внутри листа: с полем вокруг и скруглением, по
   центру напротив текста, а не прибитый к углу. */
.portrait-wrap {
  margin: 28px 0 28px 28px;
}

.portrait {
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-dark);
  box-shadow: 0 16px 30px -18px rgba(0, 0, 0, .9);
}

.portrait img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Портрет с полной картинкой — кнопка, но выглядит ровно как обычный. */
.portrait.zoomable {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  cursor: zoom-in;
}

.zoom {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(20, 14, 10, .66);
  color: var(--parchment-2);
  transition: opacity .15s ease, color .15s ease;
}

/* С мышью значок всплывает при наведении и не мешает смотреть на портрет;
   на телефоне наводить нечем — там он виден всегда, только приглушённый. */
.zoom {
  opacity: .8;
}

@media (hover: hover) {
  .zoom {
    opacity: 0;
  }

  .portrait.zoomable:hover .zoom,
  .portrait.zoomable:focus-visible .zoom {
    opacity: 1;
    color: var(--ember-soft);
  }
}

/* Картинка целиком: поверх листа, вписана в экран. Мимо картинки — закрытие,
   по самой картинке — увеличение. Раздутая наружу не вылезает: слой её режет. */
.photo {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: grid;
  place-items: center;
  padding: 20px;
  overflow: hidden;
  background: rgba(12, 8, 6, .9);
  cursor: zoom-out;
  animation: fade-in .15s ease;
}

.photo img {
  display: block;
  max-width: min(100%, 900px);
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  border-radius: var(--radius-md);
  box-shadow:
    0 30px 60px -30px rgba(0, 0, 0, .9),
    0 0 0 1px color-mix(in srgb, var(--glow) 35%, transparent);
  cursor: zoom-in;
  /* Щипок и перетаскивание ведём сами — иначе браузер начнёт возить страницу. */
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

.photo img.smooth {
  transition: transform .18s ease;
}

.photo img.zoomed {
  cursor: grab;
}

.photo img.dragging {
  cursor: grabbing;
}

/* Когда картинка раздута на весь экран, мимо неё уже не щёлкнешь — нужен крестик. */
.photo-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(20, 14, 10, .7);
  color: var(--parchment-2);
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}

.photo-close:hover {
  color: var(--ember-soft);
}

.placeholder {
  height: 100%;
  display: grid;
  place-items: center;
  background:
    radial-gradient(ellipse at 50% 110%, rgba(214, 136, 62, .28), transparent 60%),
    linear-gradient(180deg, #2b221c, #1a1410);
}

.initial {
  font-size: 110px;
  font-weight: 500;
  color: rgba(232, 176, 122, .55);
  line-height: 1;
}

.content {
  padding: 28px 28px 28px 32px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
  padding-right: 32px;
}

.name {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.15;
}

.original {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-muted);
}

.facts {
  margin: 0;
  display: grid;
  gap: 6px;
  font-size: 13px;
}

.fact {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 12px;
}

.fact dt {
  color: var(--text-muted);
}

.fact dd {
  margin: 0;
  color: var(--parchment-2);
}

.description {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid rgba(241, 230, 210, .1);
  font-size: 14px;
  line-height: 1.7;
  color: var(--parchment-2);
}

.description p {
  margin: 0 0 12px;
}

.description p:last-child {
  margin-bottom: 0;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* На телефоне — та же карточка по центру, с полями по краям: портрет
   сверху и стоит на месте, прокручивается только текст под ним. */
@media (max-width: 720px) {
  .backdrop {
    padding: 16px;
  }

  /* dvh, а не vh: на телефоне vh считает и адресную строку, и низ листа
     уезжал под неё. Старые браузеры без dvh остаются на vh. */
  .sheet {
    display: flex;
    flex-direction: column;
    align-items: stretch; /* иначе центрирование из настольной сетки сжимает портрет в полоску */
    width: 100%;
    max-width: 420px;
    max-height: calc(100vh - 32px);
    max-height: calc(100dvh - 32px);
  }

  /* Портрет всегда квадрат: во всю ширину листа, а в низком окне — меньше и
     по центру, чтобы тексту оставалось место. */
  .portrait-wrap {
    flex-shrink: 0;
    width: min(100% - 36px, 38vh);
    width: min(100% - 36px, 38dvh);
    margin: 18px auto 0;
  }

  .initial {
    font-size: 96px;
  }

  .photo {
    padding: 12px;
  }

  .photo img {
    max-height: calc(100vh - 24px);
    max-height: calc(100dvh - 24px);
  }

  /* Текст уходит под портрет с растворением, а не обрезом по линейке. */
  .content {
    flex: 1 1 auto;
    min-height: 0;
    padding: 18px 18px 22px;
    max-height: none;
    mask-image: linear-gradient(to bottom, transparent, #000 18px);
  }

  .head {
    padding-right: 0;
  }

  .name {
    font-size: 24px;
  }

  .fact {
    grid-template-columns: 92px 1fr;
  }
}
</style>
