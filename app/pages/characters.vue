<script setup lang="ts">
// Импортируем явно, а не через автоимпорт: новый экспорт из shared/ попадает в
// сгенерированный список не сразу, и в шаблоне он оказывается undefined.
import { CHARACTER_FILTERS, type Character, type CharacterFilterKey, type Origin } from '#shared/utils/characters'

type Sort = 'name' | 'flames'

const auth = useAuthStore()
const { data: settings } = await useFetch('/api/settings')
// deep: огонёк меняет поля карточки на месте, и без глубокой реактивности
// (в Nuxt 4 она по умолчанию выключена) страница этого не увидит.
const { data } = await useFetch<{ characters: Character[] }>('/api/characters', { deep: true })

const characters = computed(() => data.value?.characters ?? [])

// ── Поиск, фильтры, сортировка ─────────────────────────────
const query = ref('')
const sort = ref<Sort>('name')
const filters = reactive<Record<CharacterFilterKey, string>>({
  gender: '', species: '', cls: '', occupation: '', continent: '', volume: '',
})

const normalize = (v: string) => v.toLowerCase().replace(/ё/g, 'е').trim()

/** Значения признака у персонажа: у тома одно число, у остальных — список. */
const valuesOf = (c: Character, key: CharacterFilterKey): string[] =>
  key === 'volume' ? [String(c.volume)] : key === 'gender' ? [c.gender] : c[key]

/**
 * Варианты для каждой выпадашки собираются из самих карточек: что есть у
 * персонажей, то и предлагаем. Русские значения сортируются по алфавиту, том —
 * по номеру.
 */
const options = computed(() => {
  const out = {} as Record<CharacterFilterKey, string[]>
  for (const { key } of CHARACTER_FILTERS) {
    const set = new Set<string>()
    for (const c of characters.value) for (const v of valuesOf(c, key)) if (v) set.add(v)
    out[key] = [...set].sort((a, b) =>
      key === 'volume' ? Number(a) - Number(b) : a.localeCompare(b, 'ru'),
    )
  }
  return out
})

const activeFilters = computed(() => CHARACTER_FILTERS.filter(f => filters[f.key]))

const resetFilters = () => {
  for (const { key } of CHARACTER_FILTERS) filters[key] = ''
  query.value = ''
}

/** Имя ищется и по-русски, и латиницей: строка сравнивается с обоими написаниями. */
const visible = computed(() => {
  const q = normalize(query.value)
  const list = characters.value.filter((c) => {
    if (q && !normalize(c.name).includes(q) && !normalize(c.original).includes(q)) return false
    return activeFilters.value.every(f => valuesOf(c, f.key).includes(filters[f.key]))
  })
  // Пришли уже по алфавиту; по огонькам — больше сверху, при равенстве алфавит.
  return sort.value === 'flames' ? [...list].sort((a, b) => b.flames - a.flames) : list
})

const list = (values: string[]) => values.length ? values.join(', ') : '—'

// ── Модалка ────────────────────────────────────────────────
const openedId = ref<string | null>(null)
const opened = computed(() => characters.value.find(c => c.id === openedId.value) ?? null)
/** Место карточки на экране в момент клика — из него вылетает модалка. */
const origin = ref<Origin | null>(null)

const openCard = (c: Character, e: Event) => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  origin.value = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  openedId.value = c.id
}

// ── Огонёк ─────────────────────────────────────────────────
const busy = new Set<string>()

/**
 * Зажигаем сразу, не дожидаясь сервера, — ответ только сверяет счётчик.
 * Не вышло — откатываем.
 */
const toggleFlame = async (c: Character) => {
  if (busy.has(c.id)) return
  busy.add(c.id)
  const before = { lit: c.lit, flames: c.flames }
  c.lit = !c.lit
  c.flames += c.lit ? 1 : -1
  try {
    const res = await $fetch<{ lit: boolean; flames: number }>(`/api/characters/${c.id}/flame`, { method: 'POST' })
    c.lit = res.lit
    c.flames = res.flames
  } catch {
    Object.assign(c, before)
  } finally {
    busy.delete(c.id)
  }
}

// ── Админ: спрятать карточку ───────────────────────────────
const toggleHidden = async (c: Character) => {
  const hidden = !c.hidden
  try {
    await $fetch(`/api/admin/characters/${c.id}/hidden`, { method: 'PUT', body: { hidden } })
    c.hidden = hidden
  } catch {
    // не вышло — карточка остаётся как была
  }
}

const siteUrl = useRuntimeConfig().public.siteUrl

useHead({
  title: `${settings.value?.characters_title || 'Персонажи'} · Странствующая Таверна`,
  link: [{ rel: 'canonical', href: `${siteUrl}/characters` }],
  // Страница пока прячется: вход только из профиля, в поиск не отдаём.
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <div class="page">
    <AppHeader
      show-nav-links
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />

    <main class="characters">
      <header class="intro">
        <div class="eyebrow">Персонажи · The Wandering Inn</div>
        <h1 class="title display">{{ settings?.characters_title || 'Кто живёт в таверне' }}</h1>
        <p v-if="settings?.characters_subtitle" class="lead">{{ settings.characters_subtitle }}</p>
      </header>

      <!-- Поиск, сортировка, фильтры — один блок: на телефоне порядок другой
           (фильтры выше сортировки), и делается это CSS-порядком. -->
      <div class="controls">
        <input
          v-model="query"
          class="search-input"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="Имя по-русски или в оригинале…"
        >
        <div class="sorts" role="group" aria-label="Сортировка">
          <button class="sort" :class="{ active: sort === 'name' }" type="button" @click="sort = 'name'">По алфавиту</button>
          <button class="sort" :class="{ active: sort === 'flames' }" type="button" @click="sort = 'flames'">По огонькам</button>
        </div>

        <div class="filters">
          <label v-for="f in CHARACTER_FILTERS" :key="f.key" class="filter" :class="{ set: filters[f.key] }">
            <span class="filter-label">{{ f.label }}</span>
            <select v-model="filters[f.key]">
              <option value="">Все</option>
              <option v-for="v in options[f.key]" :key="v" :value="v">{{ v }}</option>
            </select>
          </label>
          <span v-if="activeFilters.length || query" class="tally">
            <span class="count">Найдено: {{ visible.length }}</span>
            <button class="reset" type="button" @click="resetFilters">Сбросить</button>
          </span>
        </div>
      </div>

      <p v-if="!visible.length" class="note">Никого такого в таверне нет.</p>

      <div v-else class="grid">
        <article
          v-for="c in visible"
          :key="c.id"
          class="card"
          :class="{ hidden: c.hidden }"
          tabindex="0"
          role="button"
          @click="openCard(c, $event)"
          @keydown.enter="openCard(c, $event)"
        >
          <div class="portrait">
            <img v-if="c.image" :src="c.image" :alt="c.name" loading="lazy">
            <div v-else class="placeholder" aria-hidden="true">
              <span class="initial display">{{ c.name.slice(0, 1) }}</span>
            </div>
            <div class="flame-slot">
              <CharacterFlame :count="c.flames" :lit="c.lit" @toggle="toggleFlame(c)" />
            </div>
            <button
              v-if="auth.isAdmin"
              class="hide-btn"
              type="button"
              :title="c.hidden ? 'Показать читателям' : 'Спрятать от читателей'"
              @click.stop="toggleHidden(c)"
            >
              {{ c.hidden ? 'Спрятана' : 'Спрятать' }}
            </button>
          </div>
          <div class="body">
            <h2 class="name display">{{ c.name }}</h2>
            <dl class="facts">
              <div class="fact">
                <dt>Возраст</dt>
                <dd>{{ c.age || '—' }}</dd>
              </div>
              <div class="fact">
                <dt>Раса</dt>
                <dd>{{ list(c.species) }}</dd>
              </div>
              <div class="fact">
                <dt>Класс</dt>
                <dd>{{ list(c.cls) }}</dd>
              </div>
            </dl>
          </div>
        </article>
      </div>
    </main>

    <CharacterModal v-if="opened" :character="opened" :origin="origin" @close="openedId = null" @flame="toggleFlame" />

    <AppFooter on-dark :settings="settings as any" />
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg-dark);
  color: var(--parchment);
  display: flex;
  flex-direction: column;
}

.characters {
  flex: 1;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 96px 20px 64px;
}

/* ── Шапка страницы ─────────────────────────── */
.intro {
  margin-bottom: 28px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ember-soft);
  margin-bottom: 12px;
}

.title {
  font-size: 38px;
  font-weight: 600;
  margin: 0 0 12px;
}

.lead {
  margin: 0;
  max-width: 640px;
  font-size: 15px;
  line-height: 1.65;
  color: var(--text-muted);
}

/* ── Поиск, сортировка, фильтры ─────────────── */
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  margin-bottom: 24px;
}

.search-input {
  flex: 1 1 280px;
  max-width: 420px;
  font-family: var(--font-body);
  font-size: 15px;
  padding: 13px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(241, 230, 210, .2);
  background: var(--bg-dark-2);
  color: var(--parchment);
  outline: none;
}

.search-input:focus {
  border-color: var(--ember);
}

.search-input::placeholder {
  color: rgba(241, 230, 210, .4);
}

.search-input::-webkit-search-cancel-button {
  filter: invert(.8);
}

.sorts {
  display: flex;
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.sort {
  font-family: var(--font-body);
  font-size: 12px;
  padding: 10px 14px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.sort.active {
  background: rgba(214, 136, 62, .18);
  color: var(--ember-soft);
}

/* ── Фильтры ────────────────────────────────── */
.filters {
  flex: 1 1 100%; /* своя строка под поиском и сортировкой */
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

/* Селект рисуем свой, список раскрытия остаётся родным — на телефоне он
   удобнее любого самодельного. */
.filter select {
  appearance: none;
  -webkit-appearance: none;
  max-width: 160px;
  font-family: var(--font-body);
  font-size: 12px;
  line-height: 1;
  padding: 7px 22px 7px 10px;
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-sm);
  background-color: var(--bg-dark-2);
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23e8dac0' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 9px;
  color: var(--parchment-2);
  cursor: pointer;
  text-overflow: ellipsis;
}

.filter.set select {
  border-color: rgba(214, 136, 62, .6);
  color: var(--ember-soft);
}

.tally {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.count {
  font-size: 12px;
  color: var(--text-muted);
}

.reset {
  font-family: var(--font-body);
  font-size: 12px;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: var(--ember-soft);
  cursor: pointer;
  text-decoration: underline dotted;
}

.note {
  margin: 32px 0;
  color: var(--text-muted);
}

/* ── Карточки ───────────────────────────────── */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.card {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-md);
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .08);
  overflow: hidden;
  cursor: pointer;
  outline: none;
  transition: border-color .15s, transform .15s, box-shadow .15s;
}

.card:hover,
.card:focus-visible {
  border-color: rgba(232, 176, 122, .45);
  transform: translateY(-2px);
  box-shadow: 0 18px 30px -20px rgba(0, 0, 0, .9);
}

.portrait {
  position: relative;
  aspect-ratio: 1;
  background: var(--bg-dark);
}

.portrait img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Пока картинок нет — тёплая заглушка с первой буквой имени. */
.placeholder {
  height: 100%;
  display: grid;
  place-items: center;
  background:
    radial-gradient(ellipse at 50% 110%, rgba(214, 136, 62, .28), transparent 60%),
    linear-gradient(180deg, #2b221c, #1a1410);
}

.initial {
  font-size: 64px;
  font-weight: 500;
  color: rgba(232, 176, 122, .55);
  line-height: 1;
}

.flame-slot {
  position: absolute;
  right: 8px;
  bottom: 8px;
}

/* Админская кнопка «спрятать»: в углу портрета, спрятанная карточка тускнеет. */
.hide-btn {
  position: absolute;
  left: 8px;
  top: 8px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px dashed rgba(241, 230, 210, .35);
  background: rgba(31, 24, 19, .75);
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: 11px;
  cursor: pointer;
}

.hide-btn:hover {
  color: var(--ember-soft);
  border-color: var(--ember-soft);
}

.card.hidden {
  opacity: .45;
}

.card.hidden .hide-btn {
  opacity: 1;
  border-style: solid;
  color: var(--ember-soft);
}

.body {
  padding: 12px 14px 14px;
}

.name {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.2;
}

.facts {
  margin: 0;
  display: grid;
  gap: 3px;
  font-size: 12px;
}

.fact {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.fact dt {
  color: var(--text-muted);
  flex-shrink: 0;
}

.fact dd {
  margin: 0;
  text-align: right;
  color: var(--parchment-2);
}

@media (max-width: 620px) {
  .characters {
    padding-top: 80px;
  }

  /* На телефоне шапка по центру: колонка узкая, прижатый к краю заголовок
     смотрится обрубленным. */
  .intro {
    text-align: center;
  }

  .lead {
    margin: 0 auto;
  }

  .title {
    font-size: 30px;
  }

  /* Порядок на телефоне: поиск, фильтры в два столбца, под ними сортировка. */
  .controls {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .search-input {
    flex: none; /* в колонке flex-basis из настольной версии растянул бы поле в высоту */
    max-width: none;
  }

  .filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 8px;
  }

  .filter {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }

  .filter select {
    width: 100%;
    max-width: none;
    padding-top: 9px;
    padding-bottom: 9px;
  }

  .tally {
    grid-column: 1 / -1;
    margin-left: 0;
    justify-content: space-between;
  }

  .sorts {
    order: 3;
  }

  .sort {
    flex: 1;
  }

  .grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .initial {
    font-size: 48px;
  }

  .body {
    padding: 10px 10px 12px;
  }

  .name {
    font-size: 15px;
  }

  .facts {
    font-size: 11px;
  }
}
</style>
