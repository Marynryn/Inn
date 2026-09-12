<script setup lang="ts">
import {
  SPEED_LABEL,
  SPEED_WPM,
  encouragement,
  formatDate,
  formatHours,
  formatNumber,
  type Speed,
} from '~/composables/useReadingStats'
import { pluralize } from '~/composables/useVolumes'

const { data: settings } = await useFetch('/api/settings')
const { data: chapters } = await useFetch('/api/chapters')

const auth = useAuthStore()
const { load, lastRead } = useReadProgress()
const { speed, hoursPerDay, loadSettings, saveSettings, sorted, bookmark, statsFor } = useReadingStats(chapters)

onMounted(() => {
  load()
  loadSettings()
})

/*
  Глава, от которой считаем. Пустая — «по закладке»: страница следует за
  чтением сама. Выбранная руками — прикидка «а если бы я дочитал до…»;
  закладку она не трогает, при следующем заходе всё снова считается от
  закладки. Выбранная глава считается прочитанной целиком.
*/
const picked = ref<string>('')
const byBookmark = computed(() => !picked.value)

const position = computed(() => picked.value ? { id: picked.value, fraction: 1 } : bookmark.value)
const stats = computed(() => statsFor(position.value))

const current = computed(() => sorted.value.find(c => c.id === position.value?.id) ?? null)

/** Оглавление для селекта — по томам, в порядке чтения. */
const volumes = computed(() => {
  const map = new Map<number, typeof sorted.value>()
  for (const ch of sorted.value) {
    if (!map.has(ch.volume)) map.set(ch.volume, [])
    map.get(ch.volume)!.push(ch)
  }
  return [...map.entries()]
})

const optionLabel = (ch: { id: string; title: string }) =>
  ch.title.includes(ch.id) ? ch.title : `${ch.id} — ${ch.title}`

const percentLabel = computed(() => {
  const p = stats.value.percent
  return p > 0 && p < 1 ? '<1' : p > 99 && p < 100 ? '>99' : String(Math.round(p))
})

const chaptersPercent = computed(() =>
  stats.value.chaptersTotal ? (stats.value.chaptersRead / stats.value.chaptersTotal) * 100 : 0,
)

const speeds = Object.keys(SPEED_WPM) as Speed[]

const setSpeed = (s: Speed) => {
  speed.value = s
  saveSettings()
}

const onHours = (e: Event) => {
  const value = parseFloat((e.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || value <= 0) return
  hoursPerDay.value = Math.min(24, value)
  saveSettings()
}

const hoursLabel = computed(() => {
  const h = hoursPerDay.value
  if (h < 1) return `${Math.round(h * 60)} мин в день`
  // «1,5 часа», а не «1,5 час»: дробное всегда идёт с «часа».
  const word = Number.isInteger(h) ? pluralize(h, 'час', 'часа', 'часов') : 'часа'
  return `${h.toLocaleString('ru-RU')} ${word} в день`
})

/** Ленты конфетти на случай, если перевод догнали: лёгкие, чисто на CSS. */
const confetti = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${(i * 0.37) % 3}s`,
  duration: `${3 + (i % 4) * 0.7}s`,
  hue: (i * 47) % 360,
}))

useHead({
  title: 'Прогресс чтения · Странствующая Таверна',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <div class="progress-page">
    <AppHeader
      show-nav-links
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />

    <div class="wrap">
      <h1 class="display page-title">Прогресс чтения</h1>
      <p class="page-sub">Сколько перевода позади, сколько впереди — и когда вы его догоните.</p>

      <!-- Позиция -->
      <section class="card">
        <label class="field-label" for="position">Дочитано до главы</label>
        <div class="select-wrap">
          <select id="position" v-model="picked" class="select">
            <option value="">
              {{ bookmark ? `По закладке — ${bookmark.id}` : 'Ещё не начинали' }}
            </option>
            <optgroup v-for="[vol, list] in volumes" :key="vol" :label="`Том ${vol}`">
              <option v-for="ch in list" :key="ch.id" :value="ch.id">{{ optionLabel(ch) }}</option>
            </optgroup>
          </select>
        </div>
        <p v-if="byBookmark && bookmark && current" class="field-note">
          <template v-if="bookmark.fraction >= 1">Глава {{ bookmark.id }} дочитана.</template>
          <template v-else-if="bookmark.fraction > 0">Глава {{ bookmark.id }} прочитана на {{ Math.round(bookmark.fraction * 100) }} %.</template>
          <template v-else>Глава {{ bookmark.id }} открыта, но ещё не начата.</template>
          Закладка двигается сама по мере чтения.
        </p>
        <p v-else-if="byBookmark && !bookmark" class="field-note">
          Откройте любую главу — закладка появится сама. Или выберите главу здесь, чтобы прикинуть.
        </p>
        <p v-else class="field-note">
          Это прикидка: закладка{{ lastRead ? ` на главе ${lastRead.id}` : '' }} остаётся на месте.
          <button class="link-btn" type="button" @click="picked = ''">Вернуться к закладке</button>
        </p>
      </section>

      <!-- Итог -->
      <section class="card hero-card" :class="{ done: stats.done }">
        <div v-if="stats.done" class="confetti" aria-hidden="true">
          <span
            v-for="(c, i) in confetti"
            :key="i"
            :style="{ left: c.left, animationDelay: c.delay, animationDuration: c.duration, background: `hsl(${c.hue} 70% 60%)` }"
          />
        </div>
        <div class="percent display">
          <span class="percent-num">{{ percentLabel }}</span><span class="percent-sign">%</span>
        </div>
        <p class="percent-caption">перевода прочитано</p>

        <div class="bar" role="progressbar" :aria-valuenow="Math.round(stats.percent)" aria-valuemin="0" aria-valuemax="100">
          <div class="bar-fill" :style="{ width: `${stats.percent}%` }" />
        </div>

        <p class="cheer">{{ encouragement(stats) }}</p>
      </section>

      <!-- Главы и слова -->
      <section class="card">
        <div class="stat-grid">
          <div class="stat">
            <b class="display">{{ stats.chaptersRead }}</b>
            <span>{{ pluralize(stats.chaptersRead, 'глава', 'главы', 'глав') }} прочитано</span>
          </div>
          <div class="stat">
            <b class="display">{{ stats.chaptersLeft }}</b>
            <span>{{ pluralize(stats.chaptersLeft, 'глава', 'главы', 'глав') }} осталось</span>
          </div>
          <div class="stat">
            <b class="display">{{ formatNumber(stats.wordsRead) }}</b>
            <span>слов прочитано · ≈{{ formatNumber(stats.pagesRead) }} стр.</span>
          </div>
          <div class="stat">
            <b class="display">{{ formatNumber(stats.wordsLeft) }}</b>
            <span>слов осталось · ≈{{ formatNumber(stats.pagesLeft) }} стр.</span>
          </div>
        </div>

        <div class="bar bar-thin" :title="`${stats.chaptersRead} из ${stats.chaptersTotal} глав`">
          <div class="bar-fill bar-fill-moss" :style="{ width: `${chaptersPercent}%` }" />
        </div>
        <p class="bar-note">
          {{ stats.chaptersRead }} из {{ stats.chaptersTotal }} {{ pluralize(stats.chaptersTotal, 'главы', 'глав', 'глав') }} ·
          всего в переводе {{ formatNumber(stats.wordsTotal) }} {{ pluralize(stats.wordsTotal, 'слово', 'слова', 'слов') }}
        </p>
      </section>

      <!-- Время -->
      <section class="card">
        <h2 class="section-title">Сколько это по времени</h2>
        <p class="section-note">Прикидка по скорости чтения. Настройки запоминаются в этом браузере.</p>

        <div class="controls">
          <div class="segmented" role="group" aria-label="Скорость чтения">
            <button
              v-for="s in speeds"
              :key="s"
              type="button"
              class="seg"
              :class="{ active: speed === s }"
              @click="setSpeed(s)"
            >
              {{ SPEED_LABEL[s] }}
              <small>{{ SPEED_WPM[s] }} сл/мин</small>
            </button>
          </div>

          <label class="hours">
            <span>Часов в день</span>
            <input
              type="number"
              min="0.25"
              max="24"
              step="0.25"
              :value="hoursPerDay"
              @change="onHours"
            >
          </label>
        </div>

        <div class="stat-grid stat-grid-3">
          <div class="stat">
            <b class="display">{{ formatHours(stats.hoursRead) }}</b>
            <span>уже прочитано</span>
          </div>
          <div class="stat">
            <b class="display">{{ formatHours(stats.hoursLeft) }}</b>
            <span>осталось до фронта перевода</span>
          </div>
          <div class="stat">
            <b class="display">{{ formatHours(stats.hoursTotal) }}</b>
            <span>весь перевод целиком</span>
          </div>
        </div>

        <p v-if="stats.done" class="finish">
          Вы на самом краю перевода. Новые главы — {{ settings?.update_schedule || '2–3' }} в неделю.
        </p>
        <p v-else-if="stats.finishAt" class="finish">
          По {{ hoursLabel }} — догоните перевод <b>{{ formatDate(stats.finishAt) }}</b>.
          <span class="finish-note">Перевод за это время тоже подрастёт, так что чуть позже.</span>
        </p>
      </section>

      <p v-if="!auth.isAuthed" class="guest-note">
        <NuxtLink to="/login?next=/progress">Войдите</NuxtLink> — и закладка будет одна на всех ваших устройствах.
      </p>
    </div>

    <AppFooter :settings="settings as any" on-dark />
  </div>
</template>

<style scoped>
.progress-page {
  min-height: 100vh;
  background: var(--bg-dark);
  color: var(--parchment);
  display: flex;
  flex-direction: column;
}

.wrap {
  flex: 1;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  padding: 96px 24px 64px;
}

.page-title {
  font-size: 30px;
  margin: 0 0 6px;
}

.page-sub {
  margin: 0 0 24px;
  font-size: 14px;
  color: var(--parchment-2);
  opacity: .7;
}

.card {
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .1);
  border-radius: var(--radius-md);
  padding: 22px 24px;
  margin-bottom: 14px;
}

/* ── Позиция ─────────────────────────────── */
.field-label {
  display: block;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .08em;
  opacity: .55;
  margin-bottom: 8px;
}

.select-wrap {
  position: relative;
}

.select-wrap::after {
  content: '';
  position: absolute;
  right: 14px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-right: 1.5px solid var(--ember-soft);
  border-bottom: 1.5px solid var(--ember-soft);
  transform: translateY(-70%) rotate(45deg);
  pointer-events: none;
}

.select {
  width: 100%;
  appearance: none;
  background: var(--bg-dark);
  color: var(--parchment);
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-sm);
  padding: 11px 36px 11px 14px;
  font-family: var(--font-body);
  font-size: 14px;
  cursor: pointer;
}

.select:focus {
  outline: none;
  border-color: var(--ember-soft);
}

.field-note {
  margin: 10px 0 0;
  font-size: 12.5px;
  line-height: 1.6;
  opacity: .6;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--ember-soft);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* ── Итог ────────────────────────────────── */
.hero-card {
  position: relative;
  overflow: hidden;
  text-align: center;
  padding: 30px 24px 26px;
}

.percent {
  line-height: 1;
  color: var(--ember-soft);
}

.percent-num {
  font-size: 64px;
  font-weight: 600;
}

.percent-sign {
  font-size: 28px;
  margin-left: 4px;
  opacity: .7;
}

.percent-caption {
  margin: 6px 0 18px;
  font-size: 13px;
  opacity: .6;
}

.bar {
  height: 10px;
  border-radius: 999px;
  background: rgba(241, 230, 210, .08);
  overflow: hidden;
}

.bar-thin {
  height: 5px;
  margin-top: 18px;
}

.bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--ember), var(--ember-soft));
  transition: width .5s ease;
}

.bar-fill-moss {
  background: var(--moss);
}

.bar-note {
  margin: 8px 0 0;
  font-size: 12px;
  opacity: .5;
}

.cheer {
  margin: 18px 0 0;
  font-size: 14px;
  color: var(--parchment-2);
  font-style: italic;
  opacity: .85;
}

.done .percent {
  color: var(--gold);
}

/* Конфетти: узкие ленты, падают с вращением. При «меньше движения» — не падают. */
.confetti {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.confetti span {
  position: absolute;
  top: -12px;
  width: 6px;
  height: 12px;
  border-radius: 1px;
  opacity: .8;
  animation: fall linear infinite;
}

@keyframes fall {
  to {
    transform: translateY(240px) rotate(540deg);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .confetti { display: none; }
}

/* ── Цифры ───────────────────────────────── */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px 20px;
}

.stat-grid-3 {
  grid-template-columns: repeat(3, 1fr);
}

.stat b {
  display: block;
  font-size: 24px;
  font-weight: 600;
  color: var(--ember-soft);
  line-height: 1.1;
}

.stat span {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  opacity: .6;
  line-height: 1.4;
}

/* ── Время ───────────────────────────────── */
.section-title {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 4px;
}

.section-note {
  margin: 0 0 16px;
  font-size: 12px;
  opacity: .45;
}

.controls {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  align-items: stretch;
  margin-bottom: 20px;
}

.segmented {
  display: flex;
  flex: 1 1 260px;
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.seg {
  flex: 1;
  background: none;
  border: none;
  border-right: 1px solid rgba(241, 230, 210, .12);
  color: var(--parchment-2);
  font-family: var(--font-body);
  font-size: 13px;
  padding: 8px 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  transition: background .15s;
}

.seg:last-child {
  border-right: none;
}

.seg small {
  font-size: 10.5px;
  opacity: .55;
}

.seg.active {
  background: rgba(214, 136, 62, .18);
  color: var(--ember-soft);
}

.hours {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  opacity: .8;
}

.hours input {
  width: 110px;
  background: var(--bg-dark);
  color: var(--parchment);
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-sm);
  padding: 9px 12px;
  font-family: var(--font-body);
  font-size: 14px;
}

.hours input:focus {
  outline: none;
  border-color: var(--ember-soft);
}

.finish {
  margin: 20px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--parchment-2);
}

.finish b {
  color: var(--ember-soft);
  font-weight: 600;
}

.finish-note {
  display: block;
  font-size: 12px;
  opacity: .5;
}

.guest-note {
  margin: 20px 0 0;
  text-align: center;
  font-size: 13px;
  opacity: .6;
}

.guest-note a {
  color: var(--ember-soft);
}

@media (max-width: 480px) {
  .wrap {
    padding: 84px 16px 48px;
  }

  .card {
    padding: 18px 16px;
  }

  .percent-num {
    font-size: 52px;
  }

  .stat-grid-3 {
    grid-template-columns: repeat(2, 1fr);
  }

  .stat b {
    font-size: 20px;
  }
}
</style>
