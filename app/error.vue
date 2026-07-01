<script setup lang="ts">
const props = defineProps<{ error: { statusCode: number; message?: string } }>()

const { data: settings } = await useFetch('/api/settings')

useHead({ title: props.error.statusCode === 404 ? '404 · Странствующая Таверна' : 'Ошибка · Странствующая Таверна' })
</script>

<template>
  <div class="error-page">
    <template v-if="error.statusCode === 404">
      <NuxtImg src="/404.jpg" alt="404 — страница съедена" class="error-img" />
      <p class="error-sub">{{ settings?.error_404_sub || 'Козёл добрался до этой страницы раньше тебя.' }}</p>
    </template>

    <template v-else-if="error.statusCode === 403">
      <NuxtImg src="/403.jpg" alt="403 — доступ закрыт" class="error-img" />
      <p class="error-sub">Сюда не пускают. Даже если очень хочется.</p>
    </template>

    <template v-else-if="error.statusCode === 500">
      <NuxtImg src="/500.jpg" alt="500 — что-то пошло не так" class="error-img" />
      <p class="error-sub">{{ error.message || 'Таверна временно закрыта. Попробуй позже.' }}</p>
    </template>

    <template v-else>
      <div class="error-code display">{{ error.statusCode }}</div>
      <p class="error-sub">{{ error.message || 'Что-то пошло не так.' }}</p>
    </template>

    <NuxtLink href="/" class="btn-home">← На главную</NuxtLink>
  </div>
</template>

<style scoped>
.error-page {
  min-height: 100vh;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 40px 24px;
  font-family: var(--font-body);
}

.error-img {
  width: 380px;
  max-width: 88vw;
  border-radius: 12px;
}

.error-code {
  font-size: 96px;
  line-height: 1;
  color: #8b5e3c;
  opacity: .25;
}

.error-sub {
  font-size: 15px;
  color: #3a2510;
  opacity: .7;
  margin: 0;
  text-align: center;
}

.btn-home {
  display: inline-block;
  padding: 11px 26px;
  background: #2a1a0a;
  color: #f5f0e8;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: transform .15s, box-shadow .15s;
}

.btn-home:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px -6px rgba(0,0,0,.4);
}
</style>
