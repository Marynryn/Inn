<script setup lang="ts">
import titleLeaf from '~/assets/leaves/maple-lime.svg'

const route = useRoute()
const rawParam = route.params.id as string

const { data: chapter, error } = await useFetch(`/api/chapters/${encodeURIComponent(rawParam)}`)

// Отдаём настоящую ошибку, а не заглушку внутри страницы: иначе несуществующая
// глава открывается с кодом 200 (для поисковиков это «мягкий 404» — они считают
// такую страницу существующей) и вместо оформленной 404 показывается голая строчка.
if (error.value) {
  throw createError({
    statusCode: error.value.statusCode ?? 404,
    message: error.value.data?.message || 'Глава не найдена',
    fatal: true,
  })
}

const { data: allChapters } = await useFetch('/api/chapters')
const { data: settings } = useFetch('/api/settings')

// Источник истины по id — ответ API (он резолвит слаг в реальный id главы),
// а не сырой параметр роута, иначе локальный прогресс чтения/пометки
// прочитанного разъедутся при переходе по нормализованной ссылке.
const chapterId = chapter.value?.id ?? rawParam.replace('-', '.')
const slug = computed(() => encodeURIComponent(slugifyChapterId(chapter.value?.id ?? rawParam)))

const { load, serverScroll, saveScroll: pushScroll } = useReadProgress()
const { prevChapter, nextChapter } = useChapterNav(chapterId, allChapters)
const { dlState, download } = useChapterDownload(chapterId)
const { showReadMarker } = useReadMarker(chapterId)
const { lastRead, showProgressModal, confirmProgressUpdate, keepProgress } = useProgressGuard(chapter, allChapters)
const { save: saveScroll, getSaved } = useScrollProgress(chapterId)

// Вид страницы — тема, кегль, высота строки, ширина. Настройки лежат в
// переменных на <html>, стили ниже их читают; здесь нужна только тема — от неё
// зависит плашка телеграма: на светлом фоне у неё другие цвета.
const { settings: readerSettings, load: loadReaderSettings } = useReaderSettings()
const lightTheme = computed(() => readerSettings.value.theme === 'sepia' || readerSettings.value.theme === 'light')

const scrollRestored = ref(false)

// При переходе на другую страницу роутер сбрасывает scrollY новой страницы в 0 —
// это может успеть вызвать debounced onScroll ниже ДО того, как слушатель снимется
// в onUnmounted, и затереть только что сохранённый прогресс нулём. Флаг закрывает
// эту гонку независимо от порядка отработки onUnmounted.
let leavingChapter = false

onBeforeRouteLeave(() => {
  leavingChapter = true
  saveScroll()
  // На сервер место в главе шлём раз за посещение, а не на каждый тик прокрутки:
  // закладке хватает, а запросов на порядок меньше.
  pushScroll(chapterId, getSaved() ?? 0)
})

onMounted(() => {
  load()
  loadReaderSettings()

  // Просмотр засчитывается отсюда, а не при рендере на сервере: до этой строки
  // доходит только тот, у кого страница действительно открылась в браузере.
  // Шлём уже разрешённый id, а не слаг из адреса: по нему сервер найдёт главу
  // сразу по ключу, без перебора всех глав ради сопоставления слагов.
  $fetch(`/api/chapters/${encodeURIComponent(chapterId)}/view`, { method: 'POST' }).catch(() => {})

  const restoreTo = (value: number) => {
    document.fonts.ready.then(() => {
      const h = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo({ top: value * h, behavior: 'instant' })
      scrollRestored.value = true
      setTimeout(() => { scrollRestored.value = false }, 3000)
    })
  }

  const saved = getSaved()
  if (saved && saved > 0.02) restoreTo(saved)

  // Закладка с сервера приходит позже локальной — этот браузер мог главу и не
  // открывать вовсе, а с другого устройства она была прочитана до середины.
  // Прыгаем только пока страницу не тронули: рывок посреди чтения хуже, чем
  // потерянное место.
  const stopServerScroll = watch(() => serverScroll.value[chapterId], (fromServer) => {
    if (!fromServer || fromServer <= 0.02) return
    if (getSaved() || window.scrollY > 40) return stopServerScroll()

    restoreTo(fromServer)
    stopServerScroll()
  })

  let timer: ReturnType<typeof setTimeout>
  const onScroll = () => {
    if (leavingChapter) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (leavingChapter) return
      saveScroll()
    }, 500)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  onUnmounted(() => {
    clearTimeout(timer)
    window.removeEventListener('scroll', onScroll)
  })
})

const siteUrl = useRuntimeConfig().public.siteUrl

// У обычных глав TWI нет настоящих названий — title в базе это просто
// «Глава N», так что description строим из текста самой главы, а не из title,
// иначе на каждой странице номер главы дублируется дважды.
const description = computed(() => chapter.value
  ? buildChapterDescription(chapter.value.id, chapter.value.contentHtml)
  : undefined)

/*
  Вид страницы применяется ещё до первой отрисовки: скрипт в шапке читает
  настройки из браузера и ставит переменные на <html>. Иначе читатель с сепией
  видел бы на каждой главе тёмную вспышку, пока не подхватится клиент. Ключ и
  переменные — те же, что в useReaderSettings.
*/
const READER_BOOT = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(LS_READER)})||'null');if(!s)return;var d=document.documentElement;if(typeof s.theme==='string')d.setAttribute('data-reader-theme',s.theme);if(s.fontSize)d.style.setProperty('--reader-font',s.fontSize+'pt');if(s.lineHeight)d.style.setProperty('--reader-lh',String(s.lineHeight));if(s.width)d.style.setProperty('--reader-width',String(s.width))}catch(e){}})()`

useHead(() => ({
  title: chapter.value ? `${chapter.value.title} · The Wandering Inn на русском — Странствующая Таверна` : 'Загрузка...',
  link: [
    { rel: 'canonical', href: `${siteUrl}/chapter/${slug.value}` },
  ],
  script: [
    { key: 'reader-boot', innerHTML: READER_BOOT, tagPosition: 'head' },
  ],
}))

useSeoMeta({
  description: () => description.value,
  ogTitle: () => chapter.value ? `${chapter.value.title} · The Wandering Inn на русском — Странствующая Таверна` : undefined,
  ogDescription: () => description.value,
  ogImage: `${siteUrl}/og.jpg`,
  ogUrl: () => `${siteUrl}/chapter/${slug.value}`,
  ogType: 'article',
  ogLocale: 'ru_RU',
  twitterCard: 'summary_large_image',
  twitterTitle: () => chapter.value ? `${chapter.value.title} · The Wandering Inn на русском — Странствующая Таверна` : undefined,
  twitterDescription: () => description.value,
  twitterImage: `${siteUrl}/og.jpg`,
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
            url: `${siteUrl}/chapter/${slug.value}`,
            image: `${siteUrl}/og.jpg`,
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
  <div v-if="chapter" class="page-wrap">
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
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
      :comments-href="`/chapter/${slug}/comments`"
      :comments-label="chapter ? `Обсуждение главы ${chapter.id}` : 'Обсуждение главы'"
    />

    <FaintLeaves />

    <!-- Значки в углах: полный экран сверху, настройки вида снизу над шаром
         уведомлений. Внутри .page-wrap — чтобы наследовать цвета темы. -->
    <FullscreenButton />
    <ReaderSettingsWidget />

    <!-- READER -->
    <div class="reader">
      <div class="reader-title-row">
        <div>
          <div class="reader-eyebrow">
            <img class="eyebrow-leaf" :src="titleLeaf" alt="" width="18" height="18">
            Том {{ chapter.volume }} · Глава {{ chapter.id }}
          </div>
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
          :href="`/chapter/${encodeURIComponent(slugifyChapterId(prevChapter.id))}`"
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
          :href="`/chapter/${encodeURIComponent(slugifyChapterId(nextChapter.id))}`"
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
      <TelegramCta
        :url="settings?.telegram_url"
        :title="settings?.tg_cta_title"
        :text="settings?.tg_cta_text"
        :on-dark="!lightTheme"
      />

      <NuxtLink
        :href="`/chapter/${slug}/comments`"
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
/*
  Тема страницы — набор переменных --rd-*. «Стандартная» повторяет прежние
  цвета сайта; остальные переопределяют переменные по атрибуту на <html>,
  который ставит useReaderSettings (и скрипт в шапке — до первой отрисовки).

  Цвет и кегль идут в текст главы наследованием, а не правилом на каждый
  абзац: так inline-стили самой главы — голубая речь фей, шрифт в 400 % —
  остаются сильнее темы, а всё без своего стиля берёт цвет и размер отсюда.
*/
.page-wrap {
  --rd-bg: var(--bg-dark-2);
  --rd-text: #e7d9c2;
  --rd-title: var(--parchment);
  --rd-muted: var(--parchment-2);
  --rd-faint: var(--moss);
  --rd-accent: var(--ember-soft);
  --rd-line: rgba(241, 230, 210, .1);
  --rd-border: rgba(241, 230, 210, .18);

  /*
    Кегль, действующий на этом экране. Настройка одна на все устройства — её
    выбирают за большим экраном, а читают потом с телефона, и 24 pt там дают
    четыре слова в строке. Поэтому выбранный кегль ограничен долей ширины
    окна: на широком экране потолок недостижим и работает выбор человека, на
    узком — текст ужимается сам, сохраняя порядок величин.

    Нижняя граница у потолка — 16px: на самом узком телефоне он не должен
    опускать текст ниже прежних 17px, иначе «крупнее» превратилось бы в
    «мельче, чем было».
  */
  --rd-font: min(var(--reader-font, 12pt), max(16px, 5.5vw));

  background: var(--rd-bg);
  min-height: 100vh;
  padding-top: 56px;
}

/*
  Полный экран включают ради текста — шапка сайта в нём только мешает: ссылки
  на игру и телеграм в этот момент не нужны, а место под них съедено.

  Два правила вместо одного списка: неизвестный селектор обесценил бы всё
  правило целиком, а :fullscreen и :-webkit-full-screen понимают разные браузеры.
*/
html:fullscreen .app-header { display: none; }
html:-webkit-full-screen .app-header { display: none; }

html:fullscreen .page-wrap { padding-top: 16px; }
html:-webkit-full-screen .page-wrap { padding-top: 16px; }

html[data-reader-theme="dark"] .page-wrap {
  --rd-bg: #000;
  --rd-text: #f8f8f8;
  --rd-title: #f8f8f8;
  --rd-muted: #d9d9d9;
  --rd-faint: #7d9a78;
  --rd-line: rgba(248, 248, 248, .12);
  --rd-border: rgba(248, 248, 248, .22);
}

html[data-reader-theme="sepia"] .page-wrap {
  --rd-bg: #f4ecd8;
  --rd-text: #111;
  --rd-title: var(--ink);
  --rd-muted: var(--ink-soft);
  --rd-faint: var(--moss);
  --rd-accent: #b4652a;
  --rd-line: rgba(42, 30, 22, .14);
  --rd-border: rgba(42, 30, 22, .26);
}

/*
  Листья — часть стандартного облика таверны. В остальных темах их нет: читать
  выбирают чистый фон, а осенний ворох поверх чёрного или белого — уже не та
  страница, за которой шли.

  Прячем правилом по атрибуту, а не условием в разметке: атрибут стоит на <html>
  ещё до первой отрисовки, поэтому листья не успевают мелькнуть.
*/
html[data-reader-theme="dark"] .faint-leaves,
html[data-reader-theme="sepia"] .faint-leaves,
html[data-reader-theme="light"] .faint-leaves {
  display: none;
}

html[data-reader-theme="light"] .page-wrap {
  --rd-bg: #fff;
  --rd-text: #111;
  --rd-title: #111;
  --rd-muted: #444;
  --rd-faint: var(--moss);
  --rd-accent: #b4652a;
  --rd-line: rgba(0, 0, 0, .12);
  --rd-border: rgba(0, 0, 0, .22);
}

.icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--rd-border);
  color: var(--rd-muted);
  font-size: 22px;
  background: none;
  cursor: pointer;
  transition: border-color .15s, color .15s;
}

.icon-btn:hover {
  border-color: var(--ember);
  color: var(--rd-accent);
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

/* Ширина колонки — доля окна из настроек; 50 % на экране 1920 — прежние 960px.
   Отступы по бокам входят в неё, как и раньше. Уже 640px колонка не бывает:
   на планшете половина окна — это столбик в четыре слова. На телефоне
   настройка не действует вовсе, см. ниже. */
.reader,
.read-marker,
.comments-cta {
  max-width: max(calc(var(--reader-width, 50) * 1vw), 640px);
}

.reader {
  /* Над фоном, но без заливки: листья просвечивают сквозь колонку */
  position: relative;
  z-index: 1;
  margin: 0 auto;
  padding: 56px 48px 0;
  color: var(--rd-title);
  /* Заголовок считает свой размер от этого: иначе при крупном кегле он
     оказывался мельче текста главы. */
  font-size: var(--rd-font);
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
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--rd-accent);
  margin-bottom: 8px;
}

/* 1.875 от кегля — ровно прежние 30px при стандартных настройках. */
.reader h1 {
  font-size: 1.875em;
  margin: 0;
  font-weight: 600;
  line-height: 1.25;
}

/* Кегль и высота строки ставятся на обёртку и наследуются: абзац со своим
   font-size в процентах или em считает его от этого кегля, а высота строки
   без единиц растёт вместе с ним. */
.reader-content {
  overflow-wrap: break-word;
  word-break: break-word;
  font-size: var(--rd-font);
  line-height: var(--reader-lh, 1.85);
  color: var(--rd-text);
}

/* Отступ между абзацами — в долях строки, чтобы рос и с кеглем, и с высотой
   строки: при прежних 17px и 1.85 это те же 22px. */
.reader-content :deep(p) {
  margin: 0 0 calc(var(--reader-lh, 1.85) * .7em);
}

/*
  «Невидимый» текст из epub: в книге он почти сливается с фоном — автор прячет
  в нём то, о чём читатель ещё не должен знать, и разглядеть можно, лишь
  всмотревшись или выделив мышью.

  Цвет берём от currentColor темы, а не числом: на чёрном фоне след получается
  чуть светлее фона, на сепии и белом — чуть темнее, и подгонять под каждую
  тему нечего. Первая строка — запасная для браузеров без color-mix.
*/
.reader-content :deep(.invisible-text) {
  color: rgba(128, 128, 128, .15);
  color: color-mix(in srgb, currentColor 12%, transparent);
}

/* Выделишь — проступит целиком, как в книге. */
.reader-content :deep(.invisible-text)::selection {
  color: var(--rd-text);
}

.reader-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 48px;
  padding: 32px 0;
  border-top: 1px solid var(--rd-line);
  font-size: 18px;
}

.reader-nav a {
  color: var(--rd-accent);
  font-weight: 500;
}

.reader-nav a:hover {
  color: var(--rd-title);
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
  margin: 0 auto;
  padding: 12px 48px;
  font-size: 12px;
  color: var(--rd-faint);
  display: flex;
  align-items: center;
  gap: 6px;
}

.comments-cta {
  margin: 0 auto;
  padding: 20px 48px 64px;
}

.comments-cta > :deep(.tg-cta) {
  margin: 0 0 18px;
}

.comments-cta-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: 1px solid var(--rd-border);
  border-radius: var(--radius-sm);
  color: var(--rd-muted);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: border-color .15s, color .15s, background .15s;
}

.comments-cta-btn:hover {
  border-color: var(--rd-accent);
  color: var(--rd-accent);
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

  /* На телефоне колонка всегда во всё окно: делить его незачем. */
  .reader,
  .read-marker,
  .comments-cta {
    max-width: none;
  }

  /* Под кнопкой полного экрана, а не вплотную к ней: на узком экране они стоят
     в один столбик у правого края, и без зазора читались бы одной кнопкой. */
  .dl-title-btn {
    margin-top: 16px;
  }

  /* На телефоне заголовок сдержаннее: полтора кегля вместо почти двух. */
  .reader h1 {
    font-size: 1.5em;
  }

  .read-marker {
    padding: 12px 18px;
  }

  .comments-cta {
    padding: 32px 18px 60px;
  }
}
</style>
