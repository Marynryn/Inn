<script setup lang="ts">
const { data: settings } = await useFetch('/api/settings')
const { data: chapters } = await useFetch('/api/chapters')

const auth = useAuthStore()
const { load } = useReadProgress()
const { volumes, totalChapters, chaptersLabel, chapterRange, getBadge } = useVolumes(chapters)
const { ctaHref, ctaText } = useHeroCta(chapters)
const { downloading, downloaded, download } = useChapterDownloadList()

onMounted(() => {
  load()
  auth.fetchMe()
})

const { lastRead } = useReadProgress()
const openVolume = ref<number | null>(null)

onMounted(() => {
  if (!chapters.value?.length) return
  const maxVol = Math.max(...chapters.value.map((c: any) => c.volume))
  if (lastRead.value) {
    const ch = chapters.value.find(c => c.id === lastRead.value!.id)
    openVolume.value = ch?.volume ?? maxVol
  } else {
    openVolume.value = maxVol
  }
})

const toggleVolume = (vol: number) => {
  openVolume.value = openVolume.value === vol ? null : vol
}

const openChapter = (id: string) => {
  navigateTo(`/chapter/${id.replace('.', '-')}`)
}

const siteUrl = 'https://stranstvuyushchaya-taverna.ru'

useHead({
  title: 'Странствующая Таверна',
  link: [{ rel: 'canonical', href: siteUrl }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Странствующая Таверна',
        url: siteUrl,
        description: 'Фанатский перевод The Wandering Inn на русский язык.',
        inLanguage: 'ru',
        potentialAction: {
          '@type': 'ReadAction',
          target: `${siteUrl}/chapter/`,
        },
      }),
    },
  ],
})

useSeoMeta({
  description: () => settings.value?.hero_subtitle || 'Фанатский перевод The Wandering Inn на русский язык.',
  ogTitle: () => settings.value?.hero_title || 'Странствующая Таверна',
  ogDescription: () => settings.value?.hero_subtitle || 'Фанатский перевод The Wandering Inn на русский язык.',
  ogImage: `${siteUrl}/hero.png`,
  ogUrl: siteUrl,
  ogType: 'website',
  ogLocale: 'ru_RU',
  twitterCard: 'summary_large_image',
  twitterTitle: () => settings.value?.hero_title || 'Странствующая Таверна',
  twitterDescription: () => settings.value?.hero_subtitle || 'Фанатский перевод The Wandering Inn на русский язык.',
  twitterImage: `${siteUrl}/hero.png`,
})
</script>

<template>
  <div>
    <!-- HERO -->
    <div class="hero">
      <div class="lantern" />
      <div class="hero-art">
        <NuxtImg src="/hero.png" alt="" />
      </div>

      <nav class="nav">
        <div class="nav-brand">
          <NuxtImg src="/favicon-32x32.png" class="nav-mark" alt="Странствующая Таверна" />
          <div class="nav-title">Странствующая Таверна</div>
        </div>
        <div class="nav-links">
          <a href="#ledger">Главы</a>
          <a :href="settings?.telegram_url || '#'" target="_blank" rel="noopener">
            Telegram <span class="ext-icon">↗</span>
          </a>
          <a :href="settings?.support_url || '#'" target="_blank" rel="noopener" class="nav-support">
            Поддержать <span class="ext-icon">↗</span>
          </a>
        </div>
      </nav>

      <div class="hero-content">
        <div class="eyebrow">Фанатский перевод · The Wandering Inn</div>
        <h1
          class="hero-title display"
          v-html="(settings?.hero_title || 'Истории трактира,\nрассказанные заново').replace(/\n/g, '<br>')"
        />
        <p class="hero-sub" v-html="(settings?.hero_subtitle || '').replace(/\n/g, '<br>')" />
        <div class="hero-actions">
          <NuxtLink class="btn btn-primary" :href="ctaHref">{{ ctaText }}</NuxtLink>
          <a class="btn btn-ghost" href="#ledger">К главам →</a>
        </div>
        <div class="hero-meta">
          <div><b class="display">{{ chaptersLabel }}</b>переведено</div>
          <div><b class="display">{{ chapterRange }}</b>текущий диапазон</div>
          <div><b class="display">{{ settings?.update_schedule || '2–3' }}</b>главы в неделю</div>
        </div>
      </div>
    </div>

    <!-- <AdSlot id="index-top" /> -->

    <!-- ОГЛАВЛЕНИЕ -->
    <div class="ledger" id="ledger">
      <div class="ledger-head">
        <h2 class="display">Оглавление</h2>
        <span>{{ settings?.ledger_note }}</span>
      </div>
      <div class="ledger-rule" />

      <VolumeAccordion
        v-for="[vol, chs] in volumes"
        :key="vol"
        :volume="vol"
        :chapters="chs"
        :is-open="openVolume === vol"
        :downloading="downloading"
        :downloaded="downloaded"
        :get-badge="getBadge"
        @toggle="toggleVolume(vol)"
        @open-chapter="openChapter"
        @download="download"
      />
    </div>

    <!-- <AdSlot id="index-mid" /> -->

    <!-- КОММЕНТАРИИ -->
    <div class="comments-wrap">
      <div class="comments-inner">
        <h2 class="display" style="margin: 0 0 6px;">Отзывы о проекте</h2>
        <p class="comments-sub">Не привязаны к конкретной главе — впечатления о переводе и сайте в целом.</p>
        <CommentSection
          title="Отзывы"
          placeholder="Что думаешь о проекте?"
          :limit="4"
        />
      </div>
    </div>

    <AppFooter :settings="settings as any" />
  </div>
</template>

<style>
.hero {
  position: relative;
  background: radial-gradient(120% 90% at 20% -10%, #3a2c22 0%, var(--bg-dark) 55%, var(--bg-dark-2) 100%);
  color: var(--parchment);
  overflow: hidden;
  padding: 0 0 64px;
}

.hero-art {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 52%;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(to right, transparent 0%, rgba(0,0,0,.6) 30%, black 65%);
  mask-image: linear-gradient(to right, transparent 0%, rgba(0,0,0,.6) 30%, black 65%);
}

.hero-art img,
.hero-art picture {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: left center;
  opacity: .5;
}

.lantern {
  position: absolute;
  width: 480px;
  height: 480px;
  border-radius: 50%;
  top: -180px;
  right: -140px;
  background: radial-gradient(circle, rgba(214,136,62,.35) 0%, rgba(214,136,62,.10) 45%, rgba(214,136,62,0) 75%);
  filter: blur(2px);
  pointer-events: none;
}

.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 24px;
  position: relative;
  z-index: 2;
  gap: 16px;
  flex-wrap: wrap;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nav-mark {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1.5px solid var(--gold);
  object-fit: cover;
}

.nav-title {
  font-size: 18px;
  letter-spacing: .02em;
  font-weight: 600;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 22px;
  font-size: 14px;
  color: var(--parchment-2);
  opacity: .85;
}

.nav-links a {
  color: inherit;
}

.nav-links a:hover {
  color: var(--ember-soft);
}

.nav-support {
  border: 1px solid rgba(201, 160, 46, .5);
  color: var(--gold) !important;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  opacity: 1 !important;
  transition: background .15s, color .15s;
}

.nav-support:hover {
  background: var(--gold);
  color: var(--bg-dark) !important;
}

.ext-icon {
  font-size: 11px;
  opacity: .7;
  margin-left: 2px;
}

.hero-content {
  position: relative;
  z-index: 2;
  padding: 48px 24px 0;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ember-soft);
  margin-bottom: 14px;
}

.hero-title {
  font-size: 42px;
  line-height: 1.08;
  font-weight: 600;
  margin: 0 0 14px;
  max-width: 560px;
}

.hero-sub {
  font-size: 15px;
  line-height: 1.65;
  color: var(--parchment-2);
  opacity: .82;
  max-width: 480px;
  margin: 0 0 26px;
}

.hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  padding: 12px 22px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: transform .15s, box-shadow .15s;
  border: none;
  cursor: pointer;
  text-decoration: none;
}

.btn-primary {
  background: var(--ember);
  color: var(--bg-dark);
  box-shadow: 0 0 0 1px rgba(214, 136, 62, .4);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px -6px rgba(214, 136, 62, .6);
}

.btn-ghost {
  border: 1px solid rgba(241, 230, 210, .25);
  color: var(--parchment-2);
  background: transparent;
}

.btn-ghost:hover {
  border-color: var(--ember-soft);
  color: var(--ember-soft);
}

.hero-meta {
  display: flex;
  gap: 28px;
  margin-top: 40px;
  font-size: 12px;
  color: var(--parchment-2);
  opacity: .7;
  flex-wrap: wrap;
}

.hero-meta b {
  color: var(--ember-soft);
  font-weight: 600;
  display: block;
  font-size: 18px;
}

.ledger {
  max-width: 760px;
  margin: 0 auto;
  padding: 56px 20px 80px;
}

.ledger-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6px;
  gap: 12px;
  flex-wrap: wrap;
}

.ledger-head h2 {
  font-size: 26px;
  margin: 0;
  font-weight: 600;
}

.ledger-head span {
  font-size: 12px;
  color: var(--ink-soft);
  letter-spacing: .06em;
}

.ledger-rule {
  height: 1px;
  background: linear-gradient(to right, var(--gold), transparent);
  margin: 18px 0 8px;
}

.comments-wrap {
  background: var(--bg-dark-2);
  padding: 64px 20px 80px;
}

.comments-inner {
  max-width: 680px;
  margin: 0 auto;
  color: var(--parchment);
}

.comments-sub {
  font-size: 13px;
  color: var(--parchment-2);
  opacity: .6;
  margin: 4px 0 28px;
}

@media (max-width: 600px) {
  .hero-art {
    width: 100%;
    opacity: .18;
  }

  .hero-title {
    font-size: 30px;
  }
}
</style>
