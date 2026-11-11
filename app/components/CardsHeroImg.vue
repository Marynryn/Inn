<script setup lang="ts">
/**
 * Портрет героя «Странствующей колоды». Картинки кладут по одной в
 * public/characters/<id>.webp (или своя для игры — public/cards/<id>.webp,
 * если у героя стоит art); пока файла нет — на его месте значок стихии,
 * а не битая картинка. Положили файл — портрет появляется сам.
 */
import { CARD_HEROES, CARD_ELEMENTS, type HeroId } from "#shared/utils/cards";

const props = defineProps<{ id: HeroId; lazy?: boolean }>();
const broken = ref(false);
watch(
  () => props.id,
  () => {
    broken.value = false;
  },
);
// Страница пришла с сервера: картинка могла не загрузиться раньше, чем Vue
// повесил обработчик, — тогда ошибку проверяем сами.
const img = ref<HTMLImageElement | null>(null);
onMounted(() => {
  const el = img.value;
  if (el?.complete && !el.naturalWidth) broken.value = true;
});
const hero = computed(() => CARD_HEROES[props.id]);
const el = computed(() => CARD_ELEMENTS[hero.value.el]);
</script>

<template>
  <span class="hero-img">
    <img
      v-if="!broken"
      ref="img"
      class="hero-pic"
      :src="`/${hero.art ? 'cards' : 'characters'}/${id}.webp`"
      :alt="hero.name"
      :loading="lazy ? 'lazy' : undefined"
      @error="broken = true"
    />
    <span
      v-else
      class="hero-pic hero-ph"
      role="img"
      :aria-label="hero.name"
      :style="{ '--ph': el.color }"
      >{{ el.symbol }}</span
    >
  </span>
</template>

<style scoped>
/* Картинка заполняет блок, а не задаёт его высоту: портреты в файлах разных
   пропорций, и иначе карты выходили разной высоты. Размер блоку задаёт тот,
   кто вставляет портрет. */
.hero-img {
  display: block;
  position: relative;
}
.hero-pic {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 20%;
  border-radius: inherit;
}
.hero-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: var(--ph);
  background: radial-gradient(
    circle at 50% 40%,
    color-mix(in srgb, var(--ph) 30%, transparent),
    color-mix(in srgb, var(--ph) 8%, transparent)
  );
}
</style>
