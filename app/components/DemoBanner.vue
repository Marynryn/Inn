<script setup lang="ts">
/*
  Плашка демо-стенда: напоминает, что это витрина, и ведёт ко входу в панель.
  Стоит в левом нижнем углу: правый заняли колокольчик и настройки главы, а
  шапка фиксирована сверху и перекрыла бы полосу над собой. Закрытая плашка
  не возвращается до конца визита (sessionStorage): на каждой главе она мешала бы читать.
*/
const KEY = 'demo-banner-hidden'
const hidden = ref(true)
const route = useRoute()
const auth = useAuthStore()

// На входе и в панели плашка лишняя: там и так понятно, что это демо, а в панели
// она закрывала бы низ бокового меню.
const shown = computed(() => !hidden.value && route.path !== '/login' && !route.path.startsWith('/admin'))

onMounted(() => {
  try {
    hidden.value = sessionStorage.getItem(KEY) === '1'
  } catch {
    hidden.value = false
  }
})

const hide = () => {
  hidden.value = true
  try { sessionStorage.setItem(KEY, '1') } catch {}
}
</script>

<template>
  <aside v-if="shown" class="demo-banner" aria-label="Демо-версия">
    <span class="demo-tag">Демо</span>
    <span class="demo-text">Данные сбрасываются каждую ночь.</span>
    <NuxtLink v-if="!auth.isAuthed" to="/login" class="demo-link">Войти в панель</NuxtLink>
    <button type="button" class="demo-close" aria-label="Скрыть" @click="hide">×</button>
  </aside>
</template>

<style scoped>
.demo-banner {
  position: fixed;
  left: 18px;
  bottom: calc(18px + env(safe-area-inset-bottom));
  z-index: var(--z-float);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100vw - 110px);
  padding: 8px 8px 8px 12px;
  border-radius: 999px;
  background: rgba(30, 22, 16, .92);
  border: 1px solid rgba(232, 168, 92, .45);
  color: var(--parchment);
  font-size: 13px;
  line-height: 1.3;
  box-shadow: 0 6px 18px rgba(0, 0, 0, .35);
}

.demo-tag {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ember);
  color: #1e1610;
  font-weight: 600;
  font-size: 12px;
}

.demo-link {
  flex: none;
  color: var(--ember);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.demo-close {
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: var(--parchment);
  font-size: 18px;
  line-height: 1;
  opacity: .7;
}

.demo-close:hover { opacity: 1; }

/* На телефоне — только метка и ссылка: длинная фраза съела бы пол-экрана. */
@media (max-width: 560px) {
  .demo-text { display: none; }
}
</style>
