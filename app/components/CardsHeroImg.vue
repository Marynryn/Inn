<script setup lang="ts">
/**
 * Портрет героя «Карт таверны». Картинки кладут по одной в
 * public/characters/<id>.webp; пока файла нет — на его месте значок стихии,
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
  <img
    v-if="!broken"
    ref="img"
    :src="`/characters/${id}.webp`"
    :alt="hero.name"
    :loading="lazy ? 'lazy' : undefined"
    @error="broken = true"
  />
  <span
    v-else
    class="hero-ph"
    role="img"
    :aria-label="hero.name"
    :style="{ '--ph': el.color }"
    >{{ el.symbol }}</span
  >
</template>

<style scoped>
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
