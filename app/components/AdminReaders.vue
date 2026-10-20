<script setup lang="ts">
import { NuxtLink } from '#components'
import type { AvatarFrame } from '#shared/utils/avatarFrames'

/**
 * Все читатели — чтобы админ мог ходить по их профилям. Строка ведёт на
 * публичную страницу читателя; «назад» возвращает на эту вкладку.
 */
type Reader = {
  id: number
  name: string
  code: string | null
  isAdmin: boolean
  avatarUrl: string | null
  avatarFrame: AvatarFrame | null
  providers: string[]
  createdAt: string
  online: boolean
}

const { data: readers, pending, error, refresh } = await useFetch<Reader[]>('/api/admin/readers', { default: () => [] })

// Кто на сайте, меняется на глазах — пока вкладка открыта, тихо перечитываем.
// Свёрнутую вкладку браузера не трогаем: смотреть всё равно некому.
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 30_000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

const PROVIDER: Record<string, string> = { google: 'Google', telegram: 'Телеграм' }
const via = (r: Reader) => r.providers.length ? r.providers.map(p => PROVIDER[p] ?? p).join(' · ') : 'пароль'

const date = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.')

// Последние пять глав читателя: раскрываются под строкой по кнопке, грузятся при
// первом раскрытии и дальше берутся из памяти — перечитывать их каждые 30 секунд незачем.
type Progress = { id: string, title: string | null, updatedAt: string }[]
const openCode = ref<string | null>(null)
const progress = reactive<Record<string, Progress | 'error'>>({})
const marks = computed(() => openCode.value ? progress[openCode.value] : undefined)

const toggle = async (code: string) => {
  openCode.value = openCode.value === code ? null : code
  if (openCode.value !== code || progress[code]) return
  try { progress[code] = await $fetch<Progress>(`/api/admin/readers/${code}/progress`) }
  catch { progress[code] = 'error' }
}

// В базе время по UTC без пояса — показываем по Москве.
const when = (sqlTime: string) => new Date(`${sqlTime.replace(' ', 'T')}Z`).toLocaleString('ru', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
})
</script>

<template>
  <div class="readers">
    <p v-if="pending" class="note">Смотрим…</p>
    <p v-else-if="error" class="note">Список не загрузился.</p>
    <p v-else-if="!readers.length" class="note">Читателей пока нет.</p>

    <ul v-else class="list">
      <li v-for="r in readers" :key="r.id">
        <div class="line">
          <component
            :is="r.code ? NuxtLink : 'div'"
            class="row"
            :to="r.code ? `/reader/${r.code}` : undefined"
          >
            <span class="ava">
              <UserAvatar :src="r.avatarUrl" :name="r.name" :frame="r.avatarFrame" :size="36" alt="" />
              <span v-if="r.online" class="online" title="Сейчас на сайте" aria-label="Сейчас на сайте" />
            </span>
            <span class="who">
              <span class="name">{{ r.name }}<span v-if="r.isAdmin" class="tag">админ</span></span>
              <span class="meta">{{ via(r) }} · с {{ date(r.createdAt) }}</span>
            </span>
            <svg v-if="r.code" class="go" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </component>
          <button
            v-if="r.code"
            type="button"
            class="marks-btn"
            :class="{ on: openCode === r.code }"
            title="Закладки"
            aria-label="Закладки"
            :aria-expanded="openCode === r.code"
            @click="toggle(r.code)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M7 4h10v16l-5-4-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
            </svg>
          </button>
        </div>

        <div v-if="r.code && openCode === r.code" class="marks">
          <p v-if="!marks" class="note">Смотрим…</p>
          <p v-else-if="marks === 'error'" class="note">Закладки не загрузились.</p>
          <p v-else-if="!marks.length" class="note">Ещё не открывал ни одной главы.</p>
          <ul v-else class="marks-list">
            <li v-for="c in marks" :key="c.id">
              <NuxtLink v-if="c.title" :to="`/chapter/${c.id}`" class="mark-title">{{ c.title }}</NuxtLink>
              <span v-else class="mark-title gone">снята с сайта</span>
              <span class="mark-when">{{ when(c.updatedAt) }}</span>
            </li>
          </ul>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.note {
  margin: 0;
  font-size: 13px;
  color: rgba(241, 230, 210, .55);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.list li + li {
  border-top: 1px solid var(--line-faint);
}

.line {
  display: flex;
  align-items: center;
  gap: 4px;
}

.row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 6px;
  border-radius: var(--radius-sm);
  color: var(--parchment);
  text-decoration: none;
}

a.row:hover {
  background: var(--fill);
}

.ava {
  position: relative;
  flex: none;
  display: inline-flex;
}

.online {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 11px;
  height: 11px;
  border-radius: var(--radius-round);
  background: #6cc46a;
  box-shadow: 0 0 0 2px var(--bg-dark);
}

.who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  margin-left: 8px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  color: var(--ember-soft);
  background: rgba(232, 176, 122, .12);
}

.meta {
  font-size: 12px;
  color: rgba(241, 230, 210, .5);
}

.go {
  flex: none;
  color: rgba(241, 230, 210, .35);
}

a.row:hover .go {
  color: var(--ember-soft);
}

.marks-btn {
  flex: none;
  display: inline-flex;
  padding: 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: rgba(241, 230, 210, .35);
  cursor: pointer;
}

.marks-btn:hover,
.marks-btn.on {
  color: var(--ember-soft);
  background: var(--fill);
}

.marks-btn.on path {
  fill: currentColor;
}

/* Закладки — под строкой, с отступом под аватаром. */
.marks {
  padding: 0 6px 12px 56px;
}

.marks-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.marks-list li {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 3px 0;
  font-size: 13px;
}

.mark-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--parchment);
  text-decoration: none;
}

a.mark-title:hover {
  color: var(--ember-soft);
}

.mark-title.gone {
  color: rgba(241, 230, 210, .4);
  font-style: italic;
}

.mark-when {
  flex: none;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: rgba(241, 230, 210, .5);
}

@media (max-width: 560px) {
  .marks {
    padding-left: 6px;
  }
}
</style>
