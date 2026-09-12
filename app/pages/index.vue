<script setup lang="ts">
import { formatHours } from '~/composables/useReadingStats'

const { data: settings } = await useFetch('/api/settings')
const { data: chapters } = await useFetch('/api/chapters')


const { load } = useReadProgress()
const { volumes, totalChapters, chaptersLabel, chapterRange, getBadge } = useVolumes(chapters)
const { ctaHref, ctaText } = useHeroCta(chapters)
// Строка под кнопкой «Продолжить»: докуда дочитано и сколько осталось. Гостю
// без закладки показывать нечего — она появляется вместе с закладкой.
const { bookmark, bookmarkStats, loadSettings } = useReadingStats(chapters)
const { downloading, downloaded, download } = useChapterDownloadList()

const scrollToLedger = () => {
  const el = document.getElementById('ledger')
  if (el) {
    const top = el.getBoundingClientRect().top + window.scrollY - 56
    smoothScrollTo(top)
  }
}

onMounted(() => {
  load()
  loadSettings()
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

const siteUrl = useRuntimeConfig().public.siteUrl

useHead({
  title: 'Странствующая Таверна — русский перевод The Wandering Inn',
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

/*
  Бегущая строка под hero. Настройка — по фразе на строку; пустая настройка
  означает «строки нет», отдельный выключатель для этого не нужен.
*/
const tickerItems = computed<string[]>(() =>
  String(settings.value?.hero_ticker ?? '')
    // Регулярка, а не '\n': из textarea в админке приходит и CRLF.
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
)

/*
  Список печатаем дважды: лента едет ровно на свою половину и в этот миг вторая
  копия стоит там, где начиналась первая, — стык не виден. Одной копии хватило бы
  только на рывок в конце.
*/
const tickerLoop = computed(() => [...tickerItems.value, ...tickerItems.value])

/*
  Строку видят только гости: это зазыв завести аккаунт, и тому, кто его уже
  завёл, она рассказывала бы про то, что у него и так есть. Отсюда и ссылка одна
  — на вход, с возвратом на главную.

  Флажок в админке отделён от текста нарочно: снять галочку и не потерять
  написанное. Пустая настройка флажка считается включённой — иначе строка,
  написанная до появления галочки, вдруг перестала бы показываться.
*/
const auth = useAuthStore()

const showTicker = computed(() =>
  !auth.isAuthed
  && tickerItems.value.length > 0
  && settings.value?.hero_ticker_on !== '0'
)

/*
  Время круга считаем от длины текста, а не берём одно на все случаи: короткая
  фраза при фиксированных 30 секундах ползла бы еле-еле, а длинная пролетала бы
  быстрее, чем её прочитать.

  Шесть знаков в секунду — около 40 пикселей в секунду при кегле 13px. Это
  медленнее темпа чтения: фразу видно целиком и есть время решить, нажимать ли.
  Не меньше 18 секунд, иначе строка из двух слов мелькает.
*/
const tickerSeconds = computed(() => {
  const chars = tickerItems.value.join(' · ').length
  return Math.max(18, Math.round(chars / 6))
})

const socialTitle = computed(() => (settings.value?.hero_title || 'Странствующая Таверна').replace(/\n/g, ' '))

const seoDescription = 'Бесплатный фанатский перевод The Wandering Inn (Блуждающий трактир) на русский. Обновляется каждую неделю. Читай онлайн или скачивай epub.'

useSeoMeta({
  description: seoDescription,
  ogTitle: () => socialTitle.value,
  ogDescription: seoDescription,
  ogImage: `${siteUrl}/og.jpg`,
  ogUrl: siteUrl,
  ogType: 'website',
  ogLocale: 'ru_RU',
  twitterCard: 'summary_large_image',
  twitterTitle: () => socialTitle.value,
  twitterDescription: seoDescription,
  twitterImage: `${siteUrl}/og.jpg`,
})
</script>

<template>
  <div>
    <AppHeader
      show-nav-links
      transparent-top
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />

    <!-- HERO -->
    <div class="hero">
      <div class="lantern" />
      <div class="hero-art">
        <NuxtImg src="/hero.webp" alt="" />
      </div>

      <div class="hero-content">
        <div class="eyebrow">Фанатский перевод · The Wandering Inn</div>
        <h1
          class="hero-title display"
          v-html="(settings?.hero_title || 'Истории трактира,\nрассказанные заново').replace(/\n/g, '<br>')"
        />
        <p class="hero-sub" v-html="(settings?.hero_subtitle || '').replace(/\n/g, '<br>')" />
        <div class="hero-actions">
          <NuxtLink class="btn btn-primary" :href="ctaHref">{{ ctaText }}</NuxtLink>
          <button class="btn btn-ghost" @click="scrollToLedger">К главам</button>
        </div>
        <NuxtLink v-if="bookmark" to="/progress" class="hero-progress">
          Прочитано {{ Math.round(bookmarkStats.percent) }} %
          <template v-if="bookmarkStats.done"> · вы догнали перевод</template>
          <template v-else> · ещё {{ formatHours(bookmarkStats.hoursLeft) }} до фронта перевода</template>
          <span class="hero-progress-arrow">→</span>
        </NuxtLink>
        <div class="hero-meta">
          <div><b class="display">{{ chaptersLabel }}</b>переведено</div>
          <div><b class="display">{{ chapterRange }}</b>текущий диапазон</div>
          <div><b class="display">{{ settings?.update_schedule || '2–3' }}</b>главы в неделю</div>
        </div>
      </div>

      <!-- Бегущая строка по нижнему краю hero.
           aria-hidden висит на ленте, а не на ссылке: текст в ней напечатан
           дважды и вслух прозвучал бы заиканием, а сама ссылка скрытой быть не
           должна — иначе она фокусируется, но не читается. Читалке отдаём
           фразы один раз через aria-label. -->
      <NuxtLink
        v-if="showTicker"
        to="/login?next=%2F"
        class="ticker"
        :style="{ '--ticker-time': tickerSeconds + 's' }"
        :aria-label="tickerItems.join('. ')"
        @click="useClarity().event('ticker_click')"
      >
        <div class="ticker-track" aria-hidden="true">
          <span v-for="(line, i) in tickerLoop" :key="i" class="ticker-item">{{ line }}</span>
        </div>
      </NuxtLink>
    </div>

    <!-- <AdSlot id="index-top" /> -->

    <!-- Светлая полоса целиком: плашка игры, оглавление, Телеграм.
         Обёртка держит систему координат для украшений, которые идут
         вдоль всей полосы, — сейчас отключённых. -->
    <div class="parchment-band">
      <div class="game-wrap">
        <GameCta
          :title="settings?.game_cta_title"
          :text="settings?.game_cta_text"
          :max-volume="settings?.game_volume_effective"
        />
      </div>

    <!-- ОГЛАВЛЕНИЕ -->
    <div class="ledger" id="ledger">
      <div class="ledger-head">
        <h2 class="display">Оглавление</h2>
        <span>{{ settings?.ledger_note }}</span>
      </div>
      <div class="ledger-rule-row">
        <div class="ledger-rule" />
        <div class="ledger-bee"><BeeApista /></div>
      </div>

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
        @download="download"
      />
    </div>

      <div class="tg-wrap">
        <TelegramCta
          :url="settings?.telegram_url"
          :title="settings?.tg_cta_title"
          :text="settings?.tg_cta_text"
        />
      </div>
    </div>

    <!-- <AdSlot id="index-mid" /> -->

    <!-- КОММЕНТАРИИ -->
    <!-- id нужен уведомлениям: у отзыва о проекте главы нет, и ссылка ведёт сюда. -->
    <div id="reviews" class="comments-wrap">
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
  padding: 56px 0 64px;
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


.hero-content {
  position: relative;
  z-index: 2;
  padding: 48px 24px 0;
}

/* ── Бегущая строка ─────────────────────────── */

/* Прижата к нижнему краю hero и ложится в его нижний отступ — тот всё равно
   пустой, поэтому остальная раскладка не сдвигается. */
.ticker {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  overflow: hidden;
  padding: 9px 0;
  /* Акцент отдан полосе, а не тексту: цветная бегущая фраза на герое читается
     как реклама, а тонкая золотая черта — как объявление на доске. Золото уже
     работает на сайте акцентом, поэтому нового цвета в палитре не появляется. */
  border-top: 1px solid rgba(201, 160, 46, .35);
  background: rgba(20, 14, 10, .5);
  backdrop-filter: blur(2px);
  display: block;
  text-decoration: none;
  cursor: pointer;
  transition: background .2s ease, border-color .2s ease;
  /* Края растворяются, иначе фразы обрубаются ровной вертикалью. */
  -webkit-mask-image: linear-gradient(to right, transparent, black 7%, black 93%, transparent);
  mask-image: linear-gradient(to right, transparent, black 7%, black 93%, transparent);
}

.ticker-track {
  display: flex;
  width: max-content;
  animation: ticker-run var(--ticker-time, 30s) linear infinite;
}

/* Навёл курсор — строка останавливается: иначе прочитать фразу на ходу и
   попасть по ней мышью нельзя. Заодно полоса светлеет, чтобы было видно, что
   она нажимается. */
.ticker:hover .ticker-track,
.ticker:focus-visible .ticker-track {
  animation-play-state: paused;
}

.ticker:hover {
  background: rgba(20, 14, 10, .68);
  border-top-color: rgba(201, 160, 46, .6);
}

.ticker:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: -2px;
}

.ticker:hover .ticker-item {
  opacity: 1;
  color: var(--parchment);
}

.ticker-item {
  white-space: nowrap;
  font-size: 13px;
  letter-spacing: .01em;
  color: var(--parchment-2);
  opacity: .9;
}

/*
  Разделитель рисуем на самой фразе, а не отдельным узлом: так он не попадает в
  разметку и не сбивает счёт при удвоении списка.

  Поля держим на точке, а не на фразах. Раньше у фраз был padding 18px с двух
  сторон, и после точки набегало 36px против 18px перед ней — зазор выходил
  вдвое шире с одной стороны. Теперь по 13px с обеих, и точка стоит ровно
  посередине между предложениями.
*/
.ticker-item::after {
  content: '·';
  margin: 0 13px;
  color: var(--gold);
  opacity: .75;
}

@keyframes ticker-run {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

/* Кому движение мешает — фразы стоят на месте, а прочитать их можно пальцем. */
@media (prefers-reduced-motion: reduce) {
  .ticker { overflow-x: auto; }
  .ticker-track { animation: none; }
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

/* Ссылка на трекер — тихая строка, а не вторая кнопка: она не зовёт, а
   отвечает на вопрос, который у читателя уже есть. */
.hero-progress {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  font-size: 13px;
  color: var(--ember-soft);
  opacity: .85;
  text-decoration: none;
  transition: opacity .15s;
}

.hero-progress:hover {
  opacity: 1;
}

.hero-progress-arrow {
  transition: transform .15s;
}

.hero-progress:hover .hero-progress-arrow {
  transform: translateX(3px);
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

/* Светлая полоса: от плашки игры до Телеграма. Листопад отмеряет по ней
   и высоту падения, и ширину полей по бокам. */
.parchment-band {
  position: relative;
}

.ledger {
  max-width: 760px;
  margin: 0 auto;
  padding: 56px 20px 36px;
}

.ledger-head {
  margin-bottom: 6px;
}

.ledger-head h2 {
  font-size: 26px;
  margin: 0;
  font-weight: 600;
}

.ledger-head span {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--ink-soft);
  letter-spacing: .06em;
}

/* Аписта валяется на линейке, поэтому под заголовком оставлен зазор
   по её росту — иначе она наезжает на подпись справа. */
.ledger-rule-row {
  position: relative;
  margin: 64px 0 8px;
}

.ledger-rule {
  height: 1px;
  background: linear-gradient(to right, var(--gold), transparent);
}

.ledger-bee {
  position: absolute;
  right: -4px;
  bottom: -5px;
  line-height: 0;
}

/* Плашка игры стоит перед оглавлением и повторяет его ширину. */
.game-wrap {
  max-width: 760px;
  margin: 0 auto;
  padding: 40px 20px 0;
}

.tg-wrap {
  max-width: 760px;
  margin: 0 auto;
  padding: 0 20px 56px;
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
    width: 70%;
    left: auto;
    right: 0;
    opacity:0.7;
   

  }

  .hero-art img,
  .hero-art picture {
    object-position: center center;
  }

  .hero-title {
    font-size: 30px;
  }

  /* Оглавление на телефоне узкое — пчела мельче, и зазор под ней меньше. */
  .ledger-rule-row {
    margin-top: 40px;
  }

  .ledger-bee {
    --bee-w: 72px;
  }

  /* Подпись переносим раньше, чтобы строка не подлезала под пчелу справа. */
  .ledger-head span {
    max-width: 200px;
  }
}
</style>
