<script setup lang="ts">
definePageMeta({ path: '/chapter/:id/comments' })

const route = useRoute()
const rawId = route.params.id as string
const chapterId = rawId.replace('-', '.')

const auth = useAuthStore()
const { data: chapter } = await useFetch(`/api/chapters/${chapterId}`)

onMounted(() => auth.fetchMe())

useHead(() => ({
  title: chapter.value
    ? `Обсуждение ${chapter.value.id} «${chapter.value.title}» · Странствующая Таверна`
    : 'Обсуждение',
}))
</script>

<template>
  <div class="comments-page">
    <!-- ШАПКА -->
    <div class="topbar">
      <NuxtLink :href="`/chapter/${rawId}`" class="back-link">
        ← К главе
      </NuxtLink>
      <div v-if="chapter" class="topbar-info">
        <span class="topbar-vol">Том {{ chapter.volume }} · {{ chapter.id }}</span>
        <span class="topbar-title">{{ chapter.title }}</span>
      </div>
      <NuxtLink href="/#ledger" class="topbar-home">На главную</NuxtLink>
    </div>

    <!-- КОНТЕНТ -->
    <div class="comments-wrap">
      <CommentSection
        :chapter-id="chapterId"
        title="Обсуждение главы"
        placeholder="Что думаешь об этой главе?"
        spoiler-note="Спойлеры по сюжету разрешены."
      />
    </div>
  </div>
</template>

<style scoped>
.comments-page {
  min-height: 100vh;
  background: var(--bg-dark-2);
  color: var(--parchment);
}

.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 32px;
  border-bottom: 1px solid rgba(241, 230, 210, .08);
  background: var(--bg-dark);
  position: sticky;
  top: 0;
  z-index: 10;
}

.back-link {
  font-size: 16px;
  color: var(--parchment-2);
  text-decoration: none;
  white-space: nowrap;
  opacity: .8;
  transition: opacity .15s, color .15s;
}

.back-link:hover {
  opacity: 1;
  color: var(--ember-soft);
}

.topbar-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.topbar-vol {
  font-size: 11px;
  color: var(--ember-soft);
  letter-spacing: .1em;
  text-transform: uppercase;
}

.topbar-title {
  font-size: 13px;
  color: var(--parchment-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar-home {
  font-size: 12px;
  color: var(--ink-soft);
  text-decoration: none;
  white-space: nowrap;
  transition: color .15s;
}

.topbar-home:hover {
  color: var(--parchment-2);
}

.comments-wrap {
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 32px 80px;
}

@media (max-width: 600px) {
  .topbar {
    padding: 12px 16px;
  }

  .topbar-home {
    display: none;
  }

  .comments-wrap {
    padding: 32px 16px 60px;
  }
}
</style>
