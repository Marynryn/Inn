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
const siteUrl = useRuntimeConfig().public.siteUrl

useSeoMeta({
  ogSiteName: 'Странствующая Таверна',
  ogTitle: 'Странствующая Таверна',
  ogDescription: 'Фанатский перевод The Wandering Inn на русский язык.',
  ogImage: `${siteUrl}/hero.png`,
  ogType: 'website',
  ogLocale: 'ru_RU',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Странствующая Таверна',
  twitterDescription: 'Фанатский перевод The Wandering Inn на русский язык.',
  twitterImage: `${siteUrl}/hero.png`,
})
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtPage />
</template>
