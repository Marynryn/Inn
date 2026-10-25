<script setup lang="ts">
const { data: settings } = await useFetch('/api/settings')

const siteUrl = useRuntimeConfig().public.siteUrl
// Адрес считаем здесь, в настройке страницы: колбэки меты пересчитываются
// позже, вне контекста Nuxt, и useRuntimeConfig там падает.
const ogImage = ogImageUrl()

const title = computed(() => settings.value?.about_title || 'О проекте')

const brand = useBrand()
const aboutDescription = brand.aboutDescription
const fullTitle = () => `${title.value} · ${brand.siteName} — перевод ${brand.bookName}`

useHead(() => ({
  title: fullTitle(),
  link: [{ rel: 'canonical', href: `${siteUrl}/about` }],
}))

useSeoMeta({
  description: aboutDescription,
  ogTitle: fullTitle,
  ogDescription: aboutDescription,
  ogUrl: `${siteUrl}/about`,
  ogType: 'website',
  ogLocale: 'ru_RU',
  ogImage,
  twitterCard: 'summary_large_image',
  twitterTitle: fullTitle,
  twitterDescription: aboutDescription,
  twitterImage: ogImage,
})
</script>

<template>
  <div class="about-page">
    <AppHeader
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />

    <div class="about-wrap">
      <h1 class="hero-title about-title">{{ title }}</h1>
      <div
        class="about-body"
        v-html="(settings?.about_text || '').replace(/\n/g, '<br>')"
      />
    </div>

    <AppFooter :settings="settings as any" />
  </div>
</template>

<style scoped>
.about-page {
  --focus-ring: var(--focus-ring-light);
  min-height: 100vh;
  background: var(--parchment);
  color: var(--ink);
  display: flex;
  flex-direction: column;
  padding-top: 56px;
}

.about-wrap {
  max-width: 720px;
  margin: 0 auto;
  padding: 56px 24px 72px;
  flex: 1;
}

.about-title {
  color: var(--ink);
  margin: 0 0 32px;
  text-align: center;
}

.about-body {
  font-size: 16px;
  line-height: 1.85;
  color: var(--ink);
}
</style>
