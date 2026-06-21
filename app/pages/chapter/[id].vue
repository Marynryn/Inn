<script setup lang="ts">
const route = useRoute()
const chapterId = (route.params.id as string).replace('-', '.')

const { data: chapter, error } = await useFetch(`/api/chapters/${chapterId}`)
const { data: allChapters } = await useFetch('/api/chapters')

const auth = useAuthStore()
const { load } = useReadProgress()
const { prevChapter, nextChapter } = useChapterNav(chapterId, allChapters)
const { dlState, download } = useChapterDownload(chapterId)
const { showReadMarker } = useReadMarker(chapterId)
const { lastRead, showProgressModal, confirmProgressUpdate, keepProgress } = useProgressGuard(chapter, allChapters)

onMounted(() => {
  load()
  auth.fetchMe()
})

const siteUrl = 'https://stranstvuyushchaya-taverna.ru'

useHead(() => ({
  title: chapter.value ? `${chapter.value.title} · Странствующая Таверна` : 'Загрузка...',
  link: [
    { rel: 'canonical', href: `${siteUrl}/chapter/${route.params.id}` },
  ],
}))

useSeoMeta({
  description: () => chapter.value
    ? `Читать главу ${chapter.value.id} «${chapter.value.title}» — фанатский перевод The Wandering Inn.`
    : undefined,
  ogTitle: () => chapter.value ? `${chapter.value.title} · Странствующая Таверна` : undefined,
  ogDescription: () => chapter.value
    ? `Читать главу ${chapter.value.id} «${chapter.value.title}» — фанатский перевод The Wandering Inn.`
    : undefined,
  ogImage: `${siteUrl}/hero.png`,
  ogUrl: () => `${siteUrl}/chapter/${route.params.id}`,
  ogType: 'article',
  ogLocale: 'ru_RU',
  twitterCard: 'summary_large_image',
})

useHead(() => ({
  script: chapter.value
    ? [
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: chapter.value.title,
            inLanguage: 'ru',
            url: `${siteUrl}/chapter/${route.params.id}`,
            image: `${siteUrl}/hero.png`,
            datePublished: chapter.value.publishedAt,
            isPartOf: {
              '@type': 'Book',
              name: 'The Wandering Inn',
              inLanguage: 'ru',
            },
            publisher: {
              '@type': 'Organization',
              name: 'Странствующая Таверна',
              url: siteUrl,
            },
          }),
        },
      ]
    : [],
}))
</script>

<template>
  <div v-if="error" class="not-found">
    Глава не найдена.
    <NuxtLink href="/">← На главную</NuxtLink>
  </div>

  <div v-else-if="chapter" class="page-wrap">
    <ProgressModal
      v-if="showProgressModal && lastRead"
      :current-id="chapter.id"
      :last-id="lastRead.id"
      @update="confirmProgressUpdate"
      @keep="keepProgress"
    />

    <!-- TOP BAR -->
    <div class="topbar">
      <NuxtLink class="back-link" href="/#ledger">← К оглавлению</NuxtLink>
      <div class="topbar-brand display">
        <NuxtImg src="/favicon-32x32.png" class="topbar-logo" alt="" />
        Странствующая Таверна
      </div>
      <button
        class="icon-btn"
        title="Скачать epub"
        :class="{ 'is-loading': dlState === 'loading', 'is-done': dlState === 'done' }"
        @click="download"
      >
        <span v-if="dlState === 'loading'" class="spin" />
        <span v-else-if="dlState === 'done'">✓</span>
        <span v-else>⭳</span>
      </button>
    </div>

    <!-- READER -->
    <div class="reader">
      <div class="reader-eyebrow">Том {{ chapter.volume }} · Глава {{ chapter.id }}</div>
      <h1 class="display">{{ chapter.title }}</h1>
      <div
        class="reader-content"
        v-html="chapter.contentHtml || '<p><em>Текст главы загружается...</em></p>'"
      />

      <div class="reader-nav">
        <NuxtLink
          v-if="prevChapter"
          :href="`/chapter/${prevChapter.id.replace('.', '-')}`"
        >
          ← {{ prevChapter.id }}
        </NuxtLink>
        <span v-else class="nav-placeholder" />

        <button
          class="icon-btn"
          title="Скачать epub"
          :class="{ 'is-loading': dlState === 'loading', 'is-done': dlState === 'done' }"
          @click="download"
        >
          <span v-if="dlState === 'loading'" class="spin" />
          <span v-else-if="dlState === 'done'">✓</span>
          <span v-else>⭳</span>
        </button>

        <NuxtLink
          v-if="nextChapter"
          :href="`/chapter/${nextChapter.id.replace('.', '-')}`"
        >
          {{ nextChapter.id }} →
        </NuxtLink>
        <span v-else class="nav-placeholder" />
      </div>
    </div>

    <div v-if="showReadMarker" class="read-marker">✓ глава отмечена как прочитанная</div>

    <!-- <AdSlot id="chapter-bottom" /> -->

    <!-- КОММЕНТАРИИ -->
    <div class="chapter-comments">
      <CommentSection
        :chapter-id="chapterId"
        title="Комментарии к главе"
        placeholder="Что думаешь об этой главе?"
        spoiler-note="Спойлеры по сюжету разрешены."
      />
    </div>
  </div>
</template>

<style scoped>
.not-found {
  padding: 80px 24px;
  text-align: center;
}

.page-wrap {
  background: var(--bg-dark-2);
  min-height: 100vh;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid rgba(241, 230, 210, .08);
  background: var(--bg-dark);
}

.back-link {
  font-size: 13px;
  color: var(--parchment-2);
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: .8;
}

.back-link:hover {
  opacity: 1;
  color: var(--ember-soft);
}

.topbar-brand {
  font-size: 15px;
  color: var(--parchment-2);
  opacity: .7;
  display: flex;
  align-items: center;
  gap: 8px;
}

.topbar-logo {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(241, 230, 210, .18);
  color: var(--parchment-2);
  font-size: 22px;
  background: none;
  cursor: pointer;
  transition: border-color .15s, color .15s;
}

.icon-btn:hover {
  border-color: var(--ember);
  color: var(--ember-soft);
}

.icon-btn.is-loading {
  pointer-events: none;
  opacity: .7;
}

.icon-btn.is-done {
  border-color: var(--moss);
  color: var(--moss);
}

.spin {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin .7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.reader {
  max-width: 960px;
  margin: 0 auto;
  padding: 56px 48px 0;
  background: var(--bg-dark-2);
  color: var(--parchment);
}

.reader-eyebrow {
  font-size: 12px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ember-soft);
  margin-bottom: 8px;
}

.reader h1 {
  font-size: 30px;
  margin: 0 0 28px;
  font-weight: 600;
  line-height: 1.25;
}

.reader-content :deep(p) {
  font-size: 17px;
  line-height: 1.85;
  color: #e7d9c2;
  margin: 0 0 22px;
}

.reader-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 48px;
  padding: 32px 0;
  border-top: 1px solid rgba(241, 230, 210, .1);
  font-size: 18px;
  background: var(--bg-dark-2);
}

.reader-nav a {
  color: var(--ember-soft);
  font-weight: 500;
}

.reader-nav a:hover {
  color: var(--parchment);
}

.nav-placeholder {
  visibility: hidden;
  width: 40px;
}

.read-marker {
  max-width: 960px;
  margin: 0 auto;
  padding: 12px 48px;
  font-size: 12px;
  color: var(--moss);
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-dark-2);
}

.chapter-comments {
  max-width: 960px;
  margin: 0 auto;
  padding: 54px 48px 80px;
  background: var(--bg-dark-2);
  color: var(--parchment);
}

@media (max-width: 600px) {
  .topbar {
    padding: 14px 16px;
  }

  .topbar-brand {
    display: none;
  }

  .reader {
    padding: 40px 18px 0;
  }

  .reader h1 {
    font-size: 24px;
  }

  .read-marker {
    padding: 12px 18px;
  }

  .chapter-comments {
    padding: 40px 18px 60px;
  }
}
</style>
