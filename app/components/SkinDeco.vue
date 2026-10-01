<script setup lang="ts">
import type { ProfileSkin } from '#shared/utils/profileSkins'

/**
 * Украшения скина поверх фона карточки: картинка в углах и пылинки. Лежит под
 * содержимым и мышь не ловит — это обои, а не часть страницы. Паучок живёт
 * отдельно, в SkinSpider: ему нужна своя дорожка в шапке, чтобы не закрывать текст.
 */
const props = defineProps<{ skin: ProfileSkin }>()

const dust = computed(() => props.skin.effects.includes('dust'))

// Пылинки раскиданы детерминированно: на сервере и в браузере одинаково,
// иначе гидратация ругалась бы на разные стили.
const motes = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  top: `${40 + (i * 23) % 60}%`,
  delay: `${-((i * 1.7) % 14)}s`,
  duration: `${11 + (i % 5) * 2}s`,
}))
</script>

<template>
  <div class="skin-deco" aria-hidden="true">
    <img class="corner tl" :src="skin.url" alt="" draggable="false">
    <img class="corner tr" :src="skin.url" alt="" draggable="false">
    <img class="corner br" :src="skin.url" alt="" draggable="false">
    <div v-if="dust" class="dust">
      <i
        v-for="(m, i) in motes"
        :key="i"
        :style="{ left: m.left, top: m.top, animationDelay: m.delay, animationDuration: m.duration }"
      />
    </div>
  </div>
</template>

<style scoped>
.skin-deco {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  border-radius: inherit;
}

/* Картинка — левый верхний угол; остальные углы — её отражения. */
.corner {
  position: absolute;
  width: 230px;
  height: 230px;
  object-fit: contain;
  user-select: none;
}

.tl { left: 0; top: 0; }
.tr { right: 0; top: 0; width: 170px; height: 170px; transform: scaleX(-1); }
.br { right: 0; bottom: 0; width: 130px; height: 130px; transform: scale(-1, -1); opacity: .7; }

.dust i {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(230, 225, 240, .35);
  animation: float 14s linear infinite;
}

@keyframes float {
  from { transform: translateY(0); opacity: 0; }
  15% { opacity: 1; }
  85% { opacity: 1; }
  to { transform: translateY(-120px); opacity: 0; }
}

@media (max-width: 560px) {
  .tl { width: 160px; height: 160px; }
  .tr { width: 120px; height: 120px; }
  .br { width: 100px; height: 100px; }
}

@media (prefers-reduced-motion: reduce) {
  .dust i { animation: none; opacity: .6; }
}
</style>
