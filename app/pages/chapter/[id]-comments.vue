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
    <AppHeader
      :back-href="`/chapter/${rawId}`"
      back-label="← К главе"
      :chapter-vol="chapter?.volume"
      :chapter-id="chapter?.id"
      :chapter-title="chapter?.title"
      show-home-link
    />

    <!-- КОНТЕНТ -->
    <div class="comments-wrap">
      <CommentSection
        :chapter-id="chapterId"
        title="Обсуждение главы"
        placeholder="Что думаешь об этой главе?"
        spoiler-note="Если хотите спойлерить, ставьте галочку 'спойлер'!"
      />
    </div>
  </div>
</template>

<style scoped>
.comments-page {
  min-height: 100vh;
  background: var(--bg-dark-2);
  color: var(--parchment);
  padding-top: 56px;
}

.comments-wrap {
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 32px 80px;
}

@media (max-width: 600px) {
  .comments-wrap {
    padding: 32px 16px 60px;
  }
}
</style>
