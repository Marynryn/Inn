<script setup lang="ts">
/**
 * Полный экран для главы — значок «углы рамки» в правом верхнем углу, под
 * шапкой. На весь экран разворачивается документ целиком, а не колонка текста:
 * так остаются и шапка, и значки в углах, и окно настроек.
 *
 * Где Fullscreen API нет (iPhone), кнопки нет вовсе — мёртвая кнопка хуже
 * отсутствующей.
 */

const supported = ref(false)
const active = ref(false)

// Пока идёт запрос на полный экран, повторный клик не шлём: браузер отвечает
// не сразу, и второй запрос он отклоняет с ошибкой в консоли.
let busy = false

const { tucked } = useScrollTuck()

const toggle = async () => {
  if (busy) return
  busy = true
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  }
  catch {
    // Браузер отказал — например, без жеста пользователя. Значок остаётся как есть.
  }
  finally {
    busy = false
  }
}

const onChange = () => {
  active.value = Boolean(document.fullscreenElement)
}

onMounted(() => {
  supported.value = Boolean(document.fullscreenEnabled)
  onChange()
  document.addEventListener('fullscreenchange', onChange)
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onChange)
})
</script>

<template>
  <!-- Рейка повторяет колонку текста: значок встаёт ровно над кнопкой
       скачивания из заголовка главы, а не у края окна — иначе на средней
       ширине два одинаковых кружка стоят рядом, но не на одной линии. -->
  <div v-if="supported" class="fs-rail" :class="{ tucked }">
    <button
      class="fs-btn"
      :class="{ 'is-active': active }"
      type="button"
      :title="active ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'"
      :aria-label="active ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'"
      :aria-pressed="active"
      @click="toggle"
    >
      <!-- Углы рамки: развернуть — углы смотрят наружу, свернуть — внутрь. -->
      <svg v-if="!active" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M2 6V2h4M12 2h4v4M16 12v4h-4M6 16H2v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <svg v-else width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M6 2v4H2M12 2v4h4M16 12h-4v4M2 12h4v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>
</template>

<style scoped>
/*
  Ширина и поля — те же, что у колонки главы (.reader), и рейка так же
  центрируется. Значение --reader-width приходит с настройками, поэтому
  столбик значков едет вместе с колонкой, когда её ширину меняют.

  Поперёк окна растянута через left/right, а не 100vw: у фиксированного блока
  так не учитывается полоса прокрутки — иначе центр разъезжался бы с колонкой
  на половину её ширины.
*/
.fs-rail {
  position: fixed;
  /* Под шапкой (56px): в самой шапке справа стоят бургер и аватарка. */
  top: 68px;
  left: 0;
  right: 0;
  z-index: 90;
  max-width: max(calc(var(--reader-width, 50) * 1vw), 640px);
  margin: 0 auto;
  padding: 0 48px;
  display: flex;
  justify-content: flex-end;
  /* Сама рейка прозрачна для мыши: кликается только кнопка. */
  pointer-events: none;
  transition: transform .25s ease, opacity .25s ease;
}

.fs-btn {
  pointer-events: auto;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--rd-border, rgba(241, 230, 210, .18));
  background: var(--rd-bg, var(--bg-dark-2));
  color: var(--rd-muted, var(--parchment-2));
  cursor: pointer;
  transition: border-color .15s, color .15s;
}

.fs-btn:hover {
  border-color: var(--ember);
  color: var(--rd-accent, var(--ember-soft));
}

/* Уезжает вверх, под шапку: вбок ему некуда — он стоит не у края окна, а над
   колонкой текста. */
.fs-rail.tucked {
  transform: translateY(-16px);
  opacity: 0;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .fs-rail { transition: none; }
}

/* В полном экране шапки нет — значок поднимается на её место. */
html:fullscreen .fs-rail { top: 16px; }
html:-webkit-full-screen .fs-rail { top: 16px; }

/* На телефоне поля и ширина колонки другие — повторяем их и здесь. */
@media (max-width: 600px) {
  .fs-rail {
    top: 62px;
    max-width: none;
    padding: 0 18px;
  }
}
</style>
