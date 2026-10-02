<script setup lang="ts">
import type { PublicReader } from '#shared/utils/readerProfile'

/**
 * Публичная страница читателя: кто он, с каких пор с нами и какие рамки
 * собрал. Открывается с аватарки или имени под комментарием и в рейтинге
 * игры. Почты и способов входа здесь нет и быть не должно.
 */

const route = useRoute()
const auth = useAuthStore()
const { data: settings } = await useFetch('/api/settings')

const code = computed(() => String(route.params.code))
// ?skin= — примерка скина хозяйкой сайта на своей странице; остальным сервер
// его не применит.
const trySkin = computed(() => (typeof route.query.skin === 'string' ? route.query.skin : undefined))
const { data: reader, error, refresh } = await useFetch<PublicReader>(() => `/api/readers/${code.value}`, {
  query: { skin: trySkin },
})

const skin = computed(() => reader.value?.skin ?? null)
const hasSpider = computed(() => Boolean(skin.value?.effects.includes('spider')))
const trying = computed(() => Boolean(trySkin.value && reader.value?.isMe && skin.value))
const skinStyle = computed(() => skin.value
  ? { '--skin-tint': skin.value.tint, '--skin-accent': skin.value.accent }
  : undefined)

const isMe = computed(() => Boolean(reader.value?.isMe))

// Даты в базе — UTC без пометки; показываем по Москве, как и всё на сайте.
const asDate = (raw: string) => new Date(`${raw.replace(' ', 'T')}Z`)

const since = computed(() => reader.value
  ? asDate(reader.value.since)
      .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' })
      .replace(/\s*г\.$/, '')
  : '')

const grantedOn = (raw: string) => asDate(raw)
  .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' })
  .replace(/\s*г\.$/, '')

const clearing = ref(false)
const clearError = ref('')

// Страница открыта всем — если в «О себе» написали гадость, хозяйка сайта
// убирает её отсюда же, где и увидела.
const clearAbout = async () => {
  if (!reader.value) return
  clearing.value = true
  clearError.value = ''
  try {
    await $fetch(`/api/admin/readers/${reader.value.code}/about`, { method: 'DELETE' })
    await refresh()
  } catch (e: any) {
    clearError.value = e.data?.message || 'Не получилось стереть'
  } finally {
    clearing.value = false
  }
}

useHead(() => ({
  title: reader.value ? `${reader.value.name} · Странствующая Таверна` : 'Читатель · Странствующая Таверна',
  // Страницы читателей — не для поисковиков: это люди, а не содержимое сайта.
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
}))
</script>

<template>
  <div class="reader-page">
    <AppHeader
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />

    <div class="reader-wrap">
      <div v-if="error || !reader" class="reader-card missing">
        <h1 class="display missing-title">Такого читателя нет</h1>
        <p class="missing-note">Может, ссылка неточная, а может, страницу закрыли.</p>
        <NuxtLink to="/" class="link-btn">На главную</NuxtLink>
      </div>

      <template v-else>
      <p v-if="trying" class="try-banner">
        Примерка скина «{{ skin?.name }}» — так страницу видишь только ты.
        <NuxtLink to="/profile" class="link-btn">Вернуться в профиль</NuxtLink>
      </p>

      <article
        class="reader-card"
        :class="{ skinned: skin }"
        :style="skinStyle"
        data-clarity-mask="true"
      >
        <SkinDeco v-if="skin" :skin="skin" />

        <header class="top" :class="{ 'has-spider': hasSpider }">
          <SkinSpider v-if="hasSpider" />
          <UserAvatar
            class="big-face"
            :src="reader.avatarUrl"
            :name="reader.name"
            :frame="reader.avatarFrame"
            :size="140"
            alt=""
          />

          <div class="info">
            <h1 class="display name">
              {{ reader.name }}<NameFigure v-if="reader.figure" :figure="reader.figure" />
            </h1>
            <!-- Здесь встанет титул, когда их начнут разыгрывать. Пустой строки
                 под именем быть не должно — поэтому пока ничего. -->

            <ul class="meta">
              <li>С нами с <b>{{ since }}</b></li>
              <li><b>{{ reader.comments }}</b> {{ pluralize(reader.comments, 'комментарий', 'комментария', 'комментариев') }}</li>
            </ul>

            <p v-if="reader.about" class="about">{{ reader.about }}</p>

            <div v-if="isMe || auth.isAdmin" class="own-row">
              <NuxtLink v-if="isMe" to="/profile" class="link-btn">Изменить профиль</NuxtLink>
              <button
                v-if="auth.isAdmin && !isMe && reader.about"
                class="link-btn danger"
                type="button"
                :disabled="clearing"
                @click="clearAbout"
              >
                {{ clearing ? 'Стираем...' : 'Стереть «О себе»' }}
              </button>
              <span v-if="clearError" class="err-msg">{{ clearError }}</span>
            </div>
          </div>
        </header>

        <section class="frames">
          <h2 class="display frames-title">
            Рамки<span class="frames-count">{{ reader.frames.length }}</span>
          </h2>

          <p v-if="!reader.frames.length" class="frames-empty">
            Рамок пока нет. Они достаются за участие в ивентах таверны.
          </p>

          <ul v-else class="frame-grid">
            <li v-for="f in reader.frames" :key="f.id" class="frame-tile">
              <span v-if="reader.avatarFrame?.id === f.id" class="worn">надета</span>
              <span class="frame-ring">
                <img :src="f.url" alt="" draggable="false">
              </span>
              <span class="frame-name">{{ f.name }}</span>
              <span class="frame-when">{{ grantedOn(f.grantedAt) }}</span>
            </li>
          </ul>
        </section>
      </article>
      </template>
    </div>

    <AppFooter :settings="settings as any" on-dark />
  </div>
</template>

<style scoped>
.reader-page {
  min-height: 100vh;
  background: var(--bg-dark);
  color: var(--parchment);
  display: flex;
  flex-direction: column;
}

.reader-wrap {
  flex: 1;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 96px 24px 64px;
}

/* Скин: фон карточки и холодный акцент берутся из каталога. Украшения лежат
   под содержимым, поэтому шапка и рамки подняты над ними. */
.reader-card.skinned {
  background:
    radial-gradient(120% 70% at 50% 0%, rgba(255, 255, 255, .06), transparent 60%),
    radial-gradient(60% 50% at 100% 100%, rgba(0, 0, 0, .35), transparent 70%),
    var(--skin-tint);
  border-color: color-mix(in srgb, var(--skin-accent) 22%, transparent);
}

/* Кружок аватарки без картинки — полупрозрачный, и паутина просвечивала бы
   сквозь лицо. В скине подкладываем под него фон карточки. */
.reader-card.skinned .big-face {
  background: linear-gradient(rgba(241, 230, 210, .08), rgba(241, 230, 210, .08)), var(--skin-tint);
}

.reader-card.skinned .meta b {
  color: var(--skin-accent);
}

.reader-card.skinned .frames {
  border-top-color: color-mix(in srgb, var(--skin-accent) 18%, transparent);
}

.reader-card.skinned .frame-tile {
  background: rgba(0, 0, 0, .3);
  border-color: color-mix(in srgb, var(--skin-accent) 18%, transparent);
}

.top,
.frames {
  position: relative;
  z-index: 1;
}

/* Дорожка паучка: текст шапки до неё не доходит, и паучок его не закроет. */
.top.has-spider {
  padding-right: 100px;
}

.try-banner {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  align-items: center;
  margin: 0 0 14px;
  padding: 10px 14px;
  border: 1px dashed rgba(232, 176, 122, .4);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--ember-soft);
}

.reader-card {
  position: relative;
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .1);
  border-radius: var(--radius-md);
  overflow: hidden;
}

/* ── Шапка: аватарка и кто это ──────────────── */
/* Отступы щедрые: рамка выходит за круг аватарки, и ей нужно место, чтобы не
   наехать на имя и не упереться в край карточки. */
.top {
  display: flex;
  align-items: center;
  gap: 40px;
  padding: 44px 36px 32px;
}

.big-face {
  margin: 12px;
  background: rgba(241, 230, 210, .08);
}

.big-face :deep(.ua-letter) {
  color: var(--ember-soft);
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 34px;
  font-weight: 700;
  line-height: 1.1;
  margin: 0;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

/* У крупного имени фигурка в полторы высоты букв была бы великовата. */
.name :deep(.name-figure img) {
  width: 1.15em;
  height: 1.15em;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  color: rgba(241, 230, 210, .6);
}

.meta b {
  color: var(--parchment);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.about {
  margin: 16px 0 0;
  font-size: 14.5px;
  line-height: 1.65;
  color: rgba(241, 230, 210, .88);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.own-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 18px;
  margin-top: 16px;
}

/* ── Коллекция рамок ────────────────────────── */
.frames {
  padding: 24px 36px 32px;
  border-top: 1px solid rgba(241, 230, 210, .1);
}

.frames-title {
  font-size: 19px;
  font-weight: 600;
  margin: 0 0 16px;
}

.frames-count {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 400;
  opacity: .45;
  margin-left: 8px;
}

.frames-empty {
  margin: 0;
  font-size: 13px;
  opacity: .5;
}

.frame-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.frame-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 14px 10px 12px;
  border: 1px solid rgba(241, 230, 210, .1);
  border-radius: var(--radius-md);
  background: var(--bg-dark);
  text-align: center;
}

.frame-ring {
  width: 92px;
  height: 92px;
  margin-bottom: 8px;
}

.frame-ring img {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
}

.frame-name {
  font-size: 13px;
  font-weight: 500;
}

.frame-when {
  font-size: 11.5px;
  opacity: .45;
}

.worn {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 10.5px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 8px;
  background: var(--moss);
  color: var(--parchment);
}

/* ── Нет такого читателя ────────────────────── */
.missing {
  padding: 36px 28px;
}

.missing-title {
  font-size: 26px;
  margin: 0 0 8px;
}

.missing-note {
  margin: 0 0 18px;
  font-size: 14px;
  opacity: .6;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--ember-soft);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
}

.link-btn:hover { text-decoration: underline; }
.link-btn:disabled { opacity: .5; cursor: default; }
.link-btn.danger { color: #e07070; }
.err-msg { font-size: 13px; color: #e07070; }

@media (max-width: 560px) {
  .reader-wrap {
    padding: 84px 16px 48px;
  }

  .top,
  .top.has-spider {
    flex-direction: column;
    text-align: center;
    gap: 22px;
    padding: 36px 20px 24px;
  }

  .meta,
  .own-row {
    justify-content: center;
  }

  .frames {
    padding: 20px 16px 24px;
  }
}
</style>
