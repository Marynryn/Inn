<script setup lang="ts">
definePageMeta({ path: '/chapter/:id/comments' })

const route = useRoute()
const rawId = route.params.id as string


const { data: chapter, error } = await useFetch(`/api/chapters/${encodeURIComponent(rawId)}`)

// Как и на странице главы — настоящий код ответа вместо пустой страницы с кодом 200.
if (error.value) {
  throw createError({
    statusCode: error.value.statusCode ?? 404,
    message: error.value.data?.message || 'Глава не найдена',
    fatal: true,
  })
}
const { data: settings } = useFetch('/api/settings')

// Как и на странице главы: id для комментариев берём из ответа API
// (реальный id главы), а не из сырого параметра роута.
const chapterId = chapter.value?.id ?? rawId.replace('-', '.')


const siteUrl = useRuntimeConfig().public.siteUrl
const slug = computed(() => encodeURIComponent(slugifyChapterId(chapter.value?.id ?? rawId)))
const pageUrl = computed(() => `${siteUrl}/chapter/${slug.value}/comments`)
const pageTitle = computed(() => chapter.value
  ? `Обсуждение ${chapter.value.id} «${chapter.value.title}» · Странствующая Таверна`
  : 'Обсуждение')
const pageDescription = computed(() => chapter.value
  ? `Обсуждение главы ${chapter.value.id} «${chapter.value.title}» — фанатский перевод The Wandering Inn.`
  : 'Обсуждение главы — фанатский перевод The Wandering Inn.')

useHead(() => ({
  title: pageTitle.value,
  link: [{ rel: 'canonical', href: pageUrl.value }],
  // Обсуждения — динамический, тонкий контент: не соревнуется в поиске со страницей главы,
  // но остаётся доступным для перехода по ссылке.
  meta: [{ name: 'robots', content: 'noindex, follow' }],
}))

useSeoMeta({
  description: () => pageDescription.value,
  ogTitle: () => pageTitle.value,
  ogDescription: () => pageDescription.value,
  ogImage: `${siteUrl}/hero.png`,
  ogUrl: () => pageUrl.value,
  ogType: 'website',
  ogLocale: 'ru_RU',
  twitterCard: 'summary_large_image',
  twitterTitle: () => pageTitle.value,
  twitterDescription: () => pageDescription.value,
  twitterImage: `${siteUrl}/hero.png`,
})
</script>

<template>
  <div class="comments-page">
    <AppHeader
      burger-left
      show-nav-links
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />



    <div class="comments-wrap">
      <NuxtLink :href="`/chapter/${slug}`" class="back-btn">
        <span class="back-chevron">‹</span> Глава {{ chapter?.id }}
      </NuxtLink>
  
  
      <CommentSection
        :chapter-id="chapterId"
        :title="chapter ? `Обсуждение главы ${chapter.id}` : 'Обсуждение главы'"
        placeholder="Что думаешь об этой главе?"
        spoiler-note="Если хотите спойлерить, ставьте галочку 'спойлер'!"
      />
    </div>
  </div>
</template>

<style scoped>
.comments-page {
  min-height: 100vh;
  background: var(--bg-dark-2);
  color: var(--parchment);
  padding-top: 56px;
}

.comments-back {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 32px;
}

.back-btn {
  font-size: 13px;
  color: var(--ember-soft);
  white-space: nowrap;
  transition: color .15s;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom:16px ;
  line-height:1;
}

.back-chevron {
  font-size: 24px;
  line-height: 1;
  vertical-align: middle;
}

.back-btn:hover {
  color: var(--parchment);
}



.comments-wrap {
  max-width: 720px;
  margin: 0 auto;
  padding: 80px 32px 80px;
}

@media (max-width: 600px) {
  .comments-back {
    padding: 12px 16px;
  }


  .comments-wrap {
    padding: 80px 16px 60px;
  }
}
</style>
