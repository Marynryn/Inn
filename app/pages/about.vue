<script setup lang="ts">
const { data: settings } = await useFetch('/api/settings')

const siteUrl = useRuntimeConfig().public.siteUrl

const title = computed(() => settings.value?.about_title || 'О проекте')

useHead(() => ({
  title: `${title.value} · Странствующая Таверна`,
  link: [{ rel: 'canonical', href: `${siteUrl}/about` }],
}))

useSeoMeta({
  description: () => settings.value?.about_text?.slice(0, 155) || 'О проекте Странствующая Таверна — фанатский перевод The Wandering Inn на русский язык.',
  ogTitle: () => `${title.value} · Странствующая Таверна`,
  ogDescription: () => settings.value?.about_text?.slice(0, 155) || 'О проекте Странствующая Таверна — фанатский перевод The Wandering Inn на русский язык.',
  ogUrl: `${siteUrl}/about`,
  ogType: 'website',
  ogLocale: 'ru_RU',
  ogImage: `${siteUrl}/hero.png`,
  twitterCard: 'summary_large_image',
  twitterTitle: () => `${title.value} · Странствующая Таверна`,
  twitterDescription: () => settings.value?.about_text?.slice(0, 155) || 'О проекте Странствующая Таверна — фанатский перевод The Wandering Inn на русский язык.',
  twitterImage: `${siteUrl}/hero.png`,
})
</script>

<template>
  <div class="about-page">
    <AppHeader
      show-nav-links
      :telegram-url="settings?.telegram_url"
      :support-url="settings?.support_url"
    />

    <div class="about-wrap">
      <h1 class="display about-title">{{ title }}</h1>
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
  font-size: clamp(28px, 5vw, 42px);
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
