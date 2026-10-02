<script setup lang="ts">
const props = defineProps<{
  boostyUrl?: string
  tributeUrl?: string
  linkClass?: string
  /** Открывать карточку вверх, а не вниз — для футера, который внизу страницы
   * и там просто нет места снизу до конца скролла. */
  openUp?: boolean
}>()

const emit = defineEmits<{ select: [] }>()

const hasBoth = computed(() => !!props.boostyUrl && !!props.tributeUrl)
const singleUrl = computed(() => props.boostyUrl || props.tributeUrl || '')

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const selectOption = () => {
  open.value = false
  emit('select')
}

const onDocClick = (e: MouseEvent) => {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <span v-if="hasBoth" ref="root" class="support-links">
    <button type="button" :class="linkClass" @click.stop="open = !open">
      Поддержать
    </button>
    <div v-if="open" class="support-menu" :class="{ 'open-up': openUp }">
      <a :href="boostyUrl" target="_blank" rel="noopener" @click="selectOption">Boosty</a>
      <a :href="tributeUrl" target="_blank" rel="noopener" @click="selectOption">Tribute</a>
    </div>
  </span>
  <a v-else-if="singleUrl" :href="singleUrl" target="_blank" rel="noopener" :class="linkClass" @click="emit('select')">
    Поддержать
  </a>
</template>

<style scoped>
.support-links {
  position: relative;
  display: inline-flex;
  justify-content: center;
}

/* Сброс дефолтных стилей <button> — снаружи прокидывается тот же класс,
   что раньше был на <a>, и он не рассчитан на фон/шрифт кнопки браузера. */
.support-links > button {
  appearance: none;
  background: none;
  font-family: inherit;
  cursor: pointer;
}

.support-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .15);
  border-radius: var(--radius-sm);
  padding: 6px;
  display: flex;
  flex-direction: column;
  min-width: 160px;
  box-shadow: 0 8px 24px -8px rgba(0, 0, 0, .5);
  z-index: 50;
}

.support-menu.open-up {
  top: auto;
  bottom: calc(100% + 8px);
}

.support-menu a {
  padding: 8px 10px;
  font-size: 13px;
  color: var(--parchment-2);
  border-radius: var(--radius-sm);
  text-decoration: none;
  white-space: nowrap;
}

.support-menu a:hover {
  color: var(--ember-soft);
  background: rgba(241, 230, 210, .06);
}
</style>
