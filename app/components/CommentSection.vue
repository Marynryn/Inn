<script setup lang="ts">
const props = defineProps<{
  chapterId?: string
  title?: string
  placeholder?: string
  spoilerNote?: string
}>()

const auth = useAuthStore()

const url = computed(() =>
  props.chapterId ? `/api/comments?chapterId=${props.chapterId}` : '/api/comments?siteWide=1'
)
const { data: comments, refresh } = await useFetch<any[]>(url)

const authorName = ref('')
const body = ref('')
const sending = ref(false)
const sendError = ref('')
const remainingChars = computed(() => 500 - body.value.length)

const post = async () => {
  if(!body.value.trim()){return}
  sending.value = true
  sendError.value = ''
  try {
    await $fetch('/api/comments', {
      method: 'POST',
      body: {
        authorName: authorName.value || 'Гость',
        body: body.value,
        chapterId: props.chapterId ?? null,
      },
    })
    authorName.value = ''
    body.value = ''
    await refresh()
  } catch(e: any) {
    sendError.value = e.data?.message || 'Ошибка при отправке'
  } finally {
    sending.value = false
  }
}

const remove = async (id: number) => {
  await $fetch(`/api/comments/${id}`, { method: 'DELETE' })
  await refresh()
}

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m} мин. назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч. назад`
  return `${Math.floor(h / 24)} д. назад`
}
</script>

<template>
  <div class="comments-section">
    <div class="comments-head">
      <h3 class="comments-title">{{ title ?? 'Комментарии' }}</h3>
      <span class="comments-count">{{ comments?.length ?? 0 }}</span>
    </div>

    <p v-if="spoilerNote" class="comments-note">{{ spoilerNote }}</p>

    <div class="comment-form">
      <input
        v-if="!auth.isAdmin"
        v-model="authorName"
        type="text"
        placeholder="Твоё имя"
        maxlength="40"
      >
      <textarea
        v-model="body"
        :placeholder="placeholder ?? 'Напиши комментарий...'"
        maxlength="500"
      />
      <div class="comment-form-footer">
        <span v-if="sendError" class="comment-error">{{ sendError }}</span>
        <span v-else class="comment-hint">
          {{ remainingChars < 100 ? `осталось ${remainingChars} символов` : 'до 500 символов' }}
        </span>
        <button
          class="btn-send"
          :disabled="!body.trim() || sending"
          @click="post"
        >
          {{ sending ? '...' : 'Отправить' }}
        </button>
      </div>
    </div>

    <div v-for="c in comments" :key="c.id" class="comment-item">
      <img v-if="c.avatarUrl" :src="c.avatarUrl" class="comment-avatar comment-avatar--img" :alt="c.authorName">
      <div v-else class="comment-avatar display">{{ c.authorName[0].toUpperCase() }}</div>
      <div class="comment-content">
        <span class="comment-name">{{ c.authorName }}</span>
        <span class="comment-time">{{ timeAgo(c.createdAt) }}</span>
        <div class="comment-body">{{ c.body }}</div>
        <button
          v-if="auth.isAdmin"
          class="comment-delete"
          @click="remove(c.id)"
        >
          Удалить
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.comments-section {
  color: var(--parchment);
}

.comments-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.comments-title {
  margin: 0;
  font-size: 14px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--parchment-2);
  font-weight: 500;
  opacity: .7;
}

.comments-count {
  font-size: 12px;
  color: var(--ink-soft);
}

.comments-note {
  font-size: 12px;
  color: var(--ink-soft);
  margin: 6px 0 22px;
}

.comment-form {
  margin-bottom: 32px;
}

.comment-form input[type="text"] {
  width: 100%;
  max-width: 200px;
  background: rgba(241, 230, 210, .05);
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: 6px;
  color: var(--parchment);
  padding: 9px 12px;
  font-family: var(--font-body);
  font-size: 13px;
  margin-bottom: 10px;
  display: block;
}

.comment-form textarea {
  width: 100%;
  min-height: 64px;
  resize: vertical;
  background: rgba(241, 230, 210, .05);
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: 6px;
  color: var(--parchment);
  padding: 12px 14px;
  font-family: var(--font-body);
  font-size: 13.5px;
  line-height: 1.6;
  margin-bottom: 10px;
  display: block;
}

.comment-form input::placeholder,
.comment-form textarea::placeholder {
  color: var(--ink-soft);
}

.comment-form input:focus-visible,
.comment-form textarea:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

.comment-form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.comment-hint {
  font-size: 11.5px;
  color: var(--ink-soft);
}

.comment-error {
  font-size: 11.5px;
  color: #c66;
}

.btn-send {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  background: var(--ember);
  color: var(--bg-dark);
  border: none;
  padding: 9px 18px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.btn-send:disabled {
  opacity: .4;
  cursor: not-allowed;
}

.comment-item {
  display: flex;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid rgba(241, 230, 210, .07);
}

.comment-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: linear-gradient(135deg, var(--ember-soft), var(--moss));
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--bg-dark);
}

.comment-avatar--img {
  object-fit: cover;
  background: none;
}

.comment-content {
  min-width: 0;
}

.comment-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--parchment);
}

.comment-time {
  font-size: 11px;
  color: var(--ink-soft);
  margin-left: 8px;
}

.comment-body {
  font-size: 13.5px;
  color: #cfc2aa;
  margin-top: 4px;
  line-height: 1.6;
}

.comment-delete {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: var(--ink-soft);
  margin-top: 6px;
  cursor: pointer;
  opacity: .6;
}

.comment-delete:hover {
  color: #c66;
  opacity: 1;
}
</style>
