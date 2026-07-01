<script setup lang="ts">
const route = useRoute()
const chapterId = (route.params.id as string).replace('-', '.')

const { data: chapter, error } = await useFetch(`/api/chapters/${chapterId}`)
const { data: allChapters } = await useFetch('/api/chapters')
const { data: settings } = useFetch('/api/settings')

const auth = useAuthStore()
const { load } = useReadProgress()
const { prevChapter, nextChapter } = useChapterNav(chapterId, allChapters)
const { dlState, download } = useChapterDownload(chapterId)
const { showReadMarker } = useReadMarker(chapterId)
const { lastRead, showProgressModal, confirmProgressUpdate, keepProgress } = useProgressGuard(chapter, allChapters)
const { save: saveScroll, getSaved } = useScrollProgress(chapterId)

const scrollRestored = ref(false)

onBeforeRouteLeave(() => {
  saveScroll()
})

onMounted(() => {
  load()
  auth.fetchMe()

  const saved = getSaved()
  if (saved && saved > 0.02) {
    document.fonts.ready.then(() => {
      const h = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo({ top: saved * h, behavior: 'instant' })
      scrollRestored.value = true
      setTimeout(() => { scrollRestored.value = false }, 3000)
    })
  }

  let timer: ReturnType<typeof setTimeout>
  const onScroll = () => {
    clearTimeout(timer)
    timer = setTimeout(saveScroll, 500)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  onUnmounted(() => {
    clearTimeout(timer)
    window.removeEventListener('scroll', onScroll)
  })
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

    <AppHeader
      show-nav-links
      :telegram-url="settings?.telegram_url"
      :support-url="settings?.support_url"
    />

    <!-- READER -->
    <div class="reader">
      <div class="reader-title-row">
        <div>
          <div class="reader-eyebrow">Том {{ chapter.volume }} · Глава {{ chapter.id }}</div>
          <h1 class="display">{{ chapter.title }}</h1>
        </div>
        <button
          class="icon-btn dl-title-btn"
          title="Скачать epub"
          :class="{ 'is-loading': dlState === 'loading', 'is-done': dlState === 'done' }"
          @click="download"
        >
          <span v-if="dlState === 'loading'" class="spin" />
          <svg v-else width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path v-if="dlState === 'done'" d="M3 9l4 4 8-8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            <path v-else d="M9 2v9M5 8l4 4 4-4M2 15h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
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
          <svg v-else width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path v-if="dlState === 'done'" d="M3 9l4 4 8-8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            <path v-else d="M9 2v9M5 8l4 4 4-4M2 15h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
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

    <Transition name="toast">
      <div v-if="scrollRestored" class="scroll-toast">↩ Продолжаем с того места</div>
    </Transition>

    <div v-if="showReadMarker" class="read-marker">✓ глава отмечена как прочитанная</div>

    <!-- <AdSlot id="chapter-bottom" /> -->

    <!-- КНОПКА КОММЕНТАРИЕВ -->
    <div class="comments-cta">
      <NuxtLink
        :href="`/chapter/${route.params.id}/comments`"
        class="comments-cta-btn"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M2 3h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6l-4 3V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Обсуждение главы
      </NuxtLink>
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
  padding-top: 56px;
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

.topbar-spacer {
  width: 40px;
}

.reader {
  max-width: 960px;
  margin: 0 auto;
  padding: 56px 48px 0;
  background: var(--bg-dark-2);
  color: var(--parchment);
}

.reader-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
}

.dl-title-btn {
  flex: 0 0 auto;
  margin-top: 6px;
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
  margin: 0;
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

.scroll-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(30, 20, 10, .92);
  border: 1px solid rgba(241, 230, 210, .15);
  color: var(--parchment-2);
  font-size: 13px;
  padding: 10px 20px;
  border-radius: 20px;
  z-index: 100;
  white-space: nowrap;
  backdrop-filter: blur(8px);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity .3s, transform .3s;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
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

.comments-cta {
  max-width: 960px;
  margin: 0 auto;
  padding: 40px 48px 80px;
  background: var(--bg-dark-2);
}

.comments-cta-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: 1px solid rgba(241, 230, 210, .2);
  border-radius: var(--radius-sm);
  color: var(--parchment-2);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: border-color .15s, color .15s, background .15s;
}

.comments-cta-btn:hover {
  border-color: var(--ember-soft);
  color: var(--ember-soft);
  background: rgba(214, 136, 62, .06);
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

  .comments-cta {
    padding: 32px 18px 60px;
  }
}
</style>
