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

/**
 * Лист вылетает из карточки: в первом кадре он сжат до её размера и стоит на
 * её месте, дальше разворачивается туда, где ему положено быть. Закрытие — тот
 * же путь назад. Без origin (или если анимации выключены в системе) остаётся
 * простое появление из CSS.
 */
const flightFrames = (): Keyframe[] | null => {
  const el = sheetEl.value
  if (!el || !props.origin) return null
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null

  const rect = el.getBoundingClientRect()
  const dx = props.origin.x + props.origin.width / 2 - (rect.x + rect.width / 2)
  const dy = props.origin.y + props.origin.height / 2 - (rect.y + rect.height / 2)
  const scale = Math.min(props.origin.width / rect.width, props.origin.height / rect.height)
  return [
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.3 },
    { transform: 'none', opacity: 1 },
  ]
}

let closing = false

const close = () => {
  if (closing) return
  const frames = flightFrames()
  if (!frames) return emit('close')
  closing = true
  sheetEl.value!.animate([...frames].reverse(), { duration: 200, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' })
    .finished.finally(() => emit('close'))
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
  if (e.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  const frames = flightFrames()
  if (frames) {
    sheetEl.value!.classList.add('flying')
    sheetEl.value!.animate(frames, { duration: 320, easing: 'cubic-bezier(.2, .8, .2, 1)' })
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
          <div class="portrait">
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
