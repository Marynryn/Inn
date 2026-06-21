<script setup lang="ts">
const props = defineProps<{
  chapterId?: string
  title?: string
  placeholder?: string
  spoilerNote?: string
  limit?: number
}>()

const auth = useAuthStore()

const url = computed(() =>
  props.chapterId ? `/api/comments?chapterId=${props.chapterId}` : '/api/comments?siteWide=1'
)
const { data: comments, refresh } = await useFetch<any[]>(url)

const authorName = ref('')
const body = ref('')
const isSpoiler = ref(false)
const sending = ref(false)
const sendError = ref('')
const remainingChars = computed(() => 500 - body.value.length)

const visibleCount = ref(props.limit ?? Infinity)
const visibleComments = computed(() =>
  props.limit ? comments.value?.slice(0, visibleCount.value) : comments.value
)
const remaining = computed(() =>
  props.limit ? Math.max(0, (comments.value?.length ?? 0) - visibleCount.value) : 0
)
const nextBatch = computed(() =>
  Math.min(remaining.value, props.limit!)
)
function showMore() {
  visibleCount.value += props.limit!
}

// Emoji picker
const showEmoji = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

if (import.meta.client) {
  import('emoji-picker-element')
}

function onEmojiClick(e: any) {
  const emoji = e.detail?.emoji?.unicode ?? ''
  if (!emoji) return
  const el = textareaRef.value
  if (!el) { body.value += emoji; return }
  const start = el.selectionStart ?? body.value.length
  const end = el.selectionEnd ?? body.value.length
  body.value = body.value.slice(0, start) + emoji + body.value.slice(end)
  nextTick(() => {
    el.selectionStart = el.selectionEnd = start + emoji.length
    el.focus()
  })
  showEmoji.value = false
}

// Закрыть picker при клике вне
function onOutsideClick(e: MouseEvent) {
  const wrap = document.querySelector('.emoji-trigger-wrap')
  if (wrap && !wrap.contains(e.target as Node)) showEmoji.value = false
}
onMounted(() => document.addEventListener('click', onOutsideClick))
onUnmounted(() => document.removeEventListener('click', onOutsideClick))

const post = async () => {
  if (!body.value.trim()) { return }
  sending.value = true
  sendError.value = ''
  try {
    await $fetch('/api/comments', {
      method: 'POST',
      body: {
        authorName: authorName.value || 'Гость',
        body: body.value,
        chapterId: props.chapterId ?? null,
        isSpoiler: isSpoiler.value,
      },
    })
    authorName.value = ''
    body.value = ''
    isSpoiler.value = false
  } catch (e: any) {
    sendError.value = e.data?.message || 'Ошибка при отправке'
    await refresh()
  } finally {
    sending.value = false
  }
}

const remove = async (id: number) => {
  await $fetch(`/api/comments/${id}`, { method: 'DELETE' })
  await refresh()
}

const react = async (id: number, type: 'like' | 'dislike') => {
  await $fetch(`/api/comments/${id}/react`, { method: 'POST', body: { type } })
  await refresh()
}

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин. назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч. назад`
  return `${Math.floor(h / 24)} д. назад`
}

// WebSocket
onMounted(() => {
  if (typeof WebSocket === 'undefined') return
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const param = props.chapterId ? `?chapterId=${props.chapterId}` : ''
  const ws = new WebSocket(`${proto}://${location.host}/_ws${param}`)

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.type === 'new_comment' && comments.value) {
        if (!comments.value.find((c: any) => c.id === msg.comment.id)) {
          comments.value = [msg.comment, ...comments.value]
        }
      }
    } catch {}
  }

  onUnmounted(() => ws.close())
})
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
      <div class="textarea-wrap">
        <textarea
          ref="textareaRef"
          v-model="body"
          :placeholder="placeholder ?? 'Напиши комментарий...'"
          maxlength="500"
        />
        <div class="emoji-trigger-wrap">
          <button class="emoji-trigger" type="button" @click.stop="showEmoji = !showEmoji">
            😊
          </button>
          <ClientOnly>
            <emoji-picker
              v-if="showEmoji"
              class="dark emoji-panel"
              @emoji-click="onEmojiClick"
            />
          </ClientOnly>
        </div>
      </div>

      <label class="spoiler-check">
        <input v-model="isSpoiler" type="checkbox">
        <span>Содержит спойлер</span>
      </label>

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

    <div v-for="c in visibleComments" :key="c.id" class="comment-item">
      <img v-if="c.avatarUrl" :src="c.avatarUrl" class="comment-avatar comment-avatar--img" :alt="c.authorName">
      <div v-else class="comment-avatar display">{{ c.authorName[0].toUpperCase() }}</div>
      <div class="comment-content">
        <span class="comment-name">{{ c.authorName }}</span>
        <span v-if="c.isSpoiler" class="spoiler-badge">[спойлер]</span>
        <span class="comment-time">{{ timeAgo(c.createdAt) }}</span>
        <div class="comment-body">{{ c.body }}</div>
        <div class="comment-actions">
          <button
            class="reaction-btn"
            :class="{ active: c.myReaction === 'like' }"
            @click="react(c.id, 'like')"
          >👍 {{ c.likes || '' }}</button>
          <button
            class="reaction-btn"
            :class="{ active: c.myReaction === 'dislike' }"
            @click="react(c.id, 'dislike')"
          >👎 {{ c.dislikes || '' }}</button>
          <button
            v-if="auth.isAdmin"
            class="comment-delete"
            @click="remove(c.id)"
          >Удалить</button>
        </div>
      </div>
    </div>
    <button
      v-if="remaining > 0"
      class="show-more-btn"
      @click="showMore"
    >
      Показать ещё {{ nextBatch }}
    </button>
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

.textarea-wrap {
  position: relative;
}

.comment-form textarea {
  width: 100%;
  min-height: 64px;
  resize: vertical;
  background: rgba(241, 230, 210, .05);
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: 6px;
  color: var(--parchment);
  padding: 12px 40px 12px 14px;
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

.emoji-trigger-wrap {
  position: absolute;
  top: 8px;
  right: 8px;
}

.emoji-trigger {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 2px;
  opacity: .5;
  transition: opacity .15s;
}

.emoji-trigger:hover {
  opacity: 1;
}

.emoji-panel {
  position: absolute;
  top: 28px;
  right: 0;
  z-index: 50;
  --num-columns: 8;
  --emoji-size: 1.3rem;
  --background: #1a1108;
  --border-color: rgba(241, 230, 210, .15);
  --indicator-color: var(--ember-soft, #d6883e);
  --input-border-color: rgba(241, 230, 210, .2);
  --input-font-color: #f1e6d2;
  --input-placeholder-color: rgba(241, 230, 210, .4);
  --search-icon-no-results-color: rgba(241, 230, 210, .3);
  --category-font-color: rgba(241, 230, 210, .5);
}

.spoiler-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--ink-soft);
  cursor: pointer;
  margin-bottom: 10px;
  user-select: none;
}

.spoiler-check input[type="checkbox"] {
  accent-color: var(--ember-soft);
  width: 14px;
  height: 14px;
  cursor: pointer;
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
  flex: 1;
}

.comment-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--parchment);
}

.spoiler-badge {
  font-size: 11px;
  color: var(--ember-soft);
  margin-left: 6px;
  opacity: .8;
  font-style: italic;
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

.comment-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.reaction-btn {
  background: none;
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: 20px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--ink-soft);
  cursor: pointer;
  transition: border-color .15s, color .15s, background .15s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.reaction-btn:hover {
  border-color: rgba(241, 230, 210, .3);
  color: var(--parchment-2);
}

.reaction-btn.active {
  border-color: var(--ember-soft);
  color: var(--ember-soft);
  background: rgba(214, 136, 62, .1);
}

.comment-delete {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: var(--ink-soft);
  cursor: pointer;
  opacity: .6;
  margin-left: auto;
}

.comment-delete:hover {
  color: #c66;
  opacity: 1;
}

.show-more-btn {
  display: block;
  width: 100%;
  margin-top: 16px;
  padding: 10px;
  background: none;
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: var(--radius-sm);
  color: var(--ink-soft);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
  transition: border-color .15s, color .15s;
}

.show-more-btn:hover {
  border-color: rgba(241, 230, 210, .3);
  color: var(--parchment-2);
}
</style>
