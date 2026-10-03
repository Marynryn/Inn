<script setup lang="ts">
import type { ReelBanner } from '#shared/utils/reel'

/**
 * Баннер барабана на главной — стоит вместо плашки игры, пока идёт ивент.
 * Кнопка открывает окно барабана; гость в нём увидит приглашение войти, так
 * что на самом баннере условие не пишем — он зовёт, а не объясняет правила.
 */
const props = defineProps<{ banner: ReelBanner }>()
const emit = defineEmits<{ open: [] }>()

// Картинки — переменными: какую показать, решает ширина экрана в CSS.
// Без телефонной на телефоне та же широкая.
const style = computed(() => {
  const { desk, mob } = props.banner.images
  const out: Record<string, string> = {}
  if (desk) out['--banner-desk'] = `url("${desk}")`
  if (mob || desk) out['--banner-mob'] = `url("${mob || desk}")`
  return out
})
</script>

<template>
  <aside class="reel-banner" :style="style">
    <div class="banner-inner">
      <div class="banner-body">
        <p class="banner-title display">{{ banner.title }}</p>
        <p class="banner-text">{{ banner.text }}</p>
      </div>
      <button class="banner-btn" type="button" @click="emit('open')">{{ banner.button }}</button>
    </div>
  </aside>
</template>

<style scoped>
/* В пропорции широкой картинки (2000 × 280), чтобы листья по краям не
   обрезались; текст встаёт в тёмную середину. Длинный текст плашку вытянет. */
.reel-banner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 50 / 7;
  padding: 12px 24px;
  border-radius: var(--radius-md);
  background-color: #17110d;
  background-image: var(--banner-desk, none);
  background-size: cover;
  background-position: center;
  overflow: hidden;
}

.banner-inner {
  display: flex;
  align-items: center;
  gap: 24px;
  /* Середина картинки — та часть, где нет листьев. */
  max-width: 72%;
}

.banner-body {
  min-width: 0;
}

.banner-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: var(--parchment);
  text-shadow: 0 1px 8px rgba(0, 0, 0, .8);
}

.banner-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: rgba(241, 230, 210, .82);
  text-shadow: 0 1px 6px rgba(0, 0, 0, .8);
}

.banner-btn {
  flex: none;
  padding: 11px 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--ember);
  color: var(--bg-dark);
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background .15s;
}

.banner-btn:hover {
  background: var(--ember-soft);
}

/* Телефон: своя картинка 16:9, всё в столбик по центру — между листьями. */
@media (max-width: 620px) {
  .reel-banner {
    aspect-ratio: 16 / 9;
    padding: 16px 14%;
    background-image: var(--banner-mob, none);
  }

  .banner-inner {
    max-width: none;
    flex-direction: column;
    gap: 12px;
    text-align: center;
  }

  .banner-title {
    font-size: 19px;
  }

  .banner-text {
    font-size: 13px;
  }
}
</style>
