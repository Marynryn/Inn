<script setup lang="ts">
useHead({
  link: [
    { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
    { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
    { rel: 'apple-touch-icon', sizes: '192x192', href: '/favicon-192x192.png' },
  ],
})

// Общие значения по умолчанию для превью ссылок (OG/Twitter) — страницы со своими
// useSeoMeta (главная, глава, о проекте, комментарии) переопределяют их конкретикой.
// Страницы без собственных тегов (например /admin, /login) всё равно получат
// осмысленное превью, а не пустую карточку.

// Адрес считаем здесь, в настройке страницы: колбэки меты пересчитываются
// позже, вне контекста Nuxt, и useRuntimeConfig там падает.
const ogImage = ogImageUrl()
const brand = useBrand()

useSeoMeta({
  ogSiteName: brand.siteName,
  ogTitle: brand.siteName,
  ogDescription: brand.description,
  ogImage,
  ogType: 'website',
  ogLocale: 'ru_RU',
  twitterCard: 'summary_large_image',
  twitterTitle: brand.siteName,
  twitterDescription: brand.description,
  twitterImage: ogImage,
})

// Демо-стенд в поиск не пускаем: это витрина для покупателей, а не сайт с книгой.
if (brand.demo) useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
</script>

<template>
  <NuxtRouteAnnouncer />
  <!-- Lazy: на боевом сайте ни разметки, ни стилей плашки в страницу не попадает. -->
  <LazyDemoBanner v-if="brand.demo" />
  <NuxtPage />
  <!-- Значок уведомлений поверх любой страницы: сам решает, показываться ли —
       у гостя уведомлений нет. -->
  <NotificationWidget />
</template>
