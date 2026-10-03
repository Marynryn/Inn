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
}

const { data: readers, pending, error } = await useFetch<Reader[]>('/api/admin/readers', { default: () => [] })

const PROVIDER: Record<string, string> = { google: 'Google', telegram: 'Телеграм' }
const via = (r: Reader) => r.providers.length ? r.providers.map(p => PROVIDER[p] ?? p).join(' · ') : 'пароль'

const date = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.')
</script>

<template>
  <div class="readers">
    <p v-if="pending" class="note">Смотрим…</p>
    <p v-else-if="error" class="note">Список не загрузился.</p>
    <p v-else-if="!readers.length" class="note">Читателей пока нет.</p>

    <ul v-else class="list">
      <li v-for="r in readers" :key="r.id">
        <component
          :is="r.code ? NuxtLink : 'div'"
          class="row"
          :to="r.code ? `/reader/${r.code}` : undefined"
        >
          <UserAvatar :src="r.avatarUrl" :name="r.name" :frame="r.avatarFrame" :size="36" alt="" />
          <span class="who">
            <span class="name">{{ r.name }}<span v-if="r.isAdmin" class="tag">админ</span></span>
            <span class="meta">{{ via(r) }} · с {{ date(r.createdAt) }}</span>
          </span>
          <svg v-if="r.code" class="go" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </component>
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
  border-top: 1px solid rgba(241, 230, 210, .08);
}

.row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 6px;
  border-radius: var(--radius-sm);
  color: var(--parchment);
  text-decoration: none;
}

a.row:hover {
  background: rgba(241, 230, 210, .05);
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
  border-radius: 4px;
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
</style>
