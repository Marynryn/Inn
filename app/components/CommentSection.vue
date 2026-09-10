<script setup lang="ts">
const props = defineProps<{
  chapterId?: string
  title?: string
  placeholder?: string
  spoilerNote?: string
  limit?: number
  showLogin?: boolean
}>()

const auth = useAuthStore()
const route = useRoute()
const loginHref = computed(() => `/login?next=${encodeURIComponent(route.fullPath)}`)

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

// Ветка: корневой комментарий и его ответы. Вложенность одноуровневая, поэтому
// достаточно разложить ответы по parentId — дерево строить не из чего.
// Корневые идут от новых к старым (так их отдаёт сервер), а ответы внутри ветки
// наоборот, от старых к новым: разговор читается сверху вниз.
const threads = computed(() => {
  const all = comments.value ?? []
  const byParent = new Map<number, any[]>()

  for (const c of all) {
    if (c.parentId == null) continue
    const list = byParent.get(c.parentId) ?? []
    list.push(c)
    byParent.set(c.parentId, list)
  }

  for (const list of byParent.values()) {
    list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  }

  return all
    .filter(c => c.parentId == null)
    .map(root => ({ root, replies: byParent.get(root.id) ?? [] }))
})

// Кому отвечали. Все реплики ветки уже загружены, поэтому имя ищем по списку, а
// не отдельным запросом. Подпись нужна только когда отвечали не корню: под самим
// корнем и так понятно, кому адресован ответ.
const nameById = computed(() => {
  const map = new Map<number, string>()
  for (const c of comments.value ?? []) map.set(c.id, c.authorName)
  return map
})

const answeredName = (c: any): string | null =>
  c.replyToId && c.replyToId !== c.parentId
    ? nameById.value.get(c.replyToId) ?? null
    : null

// «Показать ещё» считает ветки, а не строки: иначе кнопка обрывала бы разговор
// на середине, оставив ответы без их комментария.
const visibleCount = ref(props.limit ?? Infinity)
const visibleThreads = computed(() =>
  props.limit ? threads.value.slice(0, visibleCount.value) : threads.value
)
const remaining = computed(() =>
  props.limit ? Math.max(0, threads.value.length - visibleCount.value) : 0
)
const nextBatch = computed(() =>
  Math.min(remaining.value, props.limit!)
)
function showMore() {
  visibleCount.value += props.limit!
}

/*
  Выбор смайлов один на две формы — и на новый комментарий, и на ответ. Держим
  не «открыт/закрыт», а у какого поля открыт: две панели разом были бы видны обе,
  а вставлять смайл надо в то поле, у которого её позвали.
*/
type EmojiTarget = 'main' | 'reply'

const showEmoji = ref<EmojiTarget | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const replyTextareaRef = ref<HTMLTextAreaElement | null>(null)

if (import.meta.client) {
  import('emoji-picker-element')
}

function onEmojiClick(e: any) {
  const emoji = e.detail?.emoji?.unicode ?? ''
  if (!emoji) return

  const toReply = showEmoji.value === 'reply'
  const model = toReply ? replyBody : body
  const el = toReply ? replyTextareaRef.value : textareaRef.value

  showEmoji.value = null

  // Поля может не быть, если панель успели открыть, а форму закрыть: тогда
  // просто дописываем смайл в конец.
  if (!el) { model.value += emoji; return }

  const start = el.selectionStart ?? model.value.length
  const end = el.selectionEnd ?? model.value.length
  model.value = model.value.slice(0, start) + emoji + model.value.slice(end)

  nextTick(() => {
    el.selectionStart = el.selectionEnd = start + emoji.length
    el.focus()
  })
}

// Закрыть панель при клике вне. Ищем ближайшую обёртку у самого клика, а не
// первую на странице: обёрток теперь две, и querySelector нашёл бы не ту.
function onOutsideClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target?.closest?.('.emoji-trigger-wrap')) showEmoji.value = null
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

// Кому отвечаем. id — тот комментарий, по которому нажали «Ответить» (он уйдёт
// на сервер, и тот сам приведёт ветку к корню), rootId — под какой веткой
// раскрыть форму, name — чьё имя показать в подсказке.
const replyTo = ref<{ id: number, rootId: number, name: string } | null>(null)
const replyBody = ref('')
const replyName = ref('')
const replySending = ref(false)
const replyError = ref('')

const startReply = (c: any, rootId: number) => {
  replyTo.value = { id: c.id, rootId, name: c.authorName }
  replyBody.value = ''
  replyError.value = ''
}

const cancelReply = () => {
  replyTo.value = null
  replyBody.value = ''
  replyError.value = ''
  if (showEmoji.value === 'reply') showEmoji.value = null
}

const sendReply = async () => {
  if (!replyTo.value || !replyBody.value.trim()) return

  replySending.value = true
  replyError.value = ''
  try {
    await $fetch('/api/comments', {
      method: 'POST',
      body: {
        authorName: replyName.value || 'Гость',
        body: replyBody.value,
        parentId: replyTo.value.id,
      },
    })
    cancelReply()
  }
  catch (e: any) {
    replyError.value = e.data?.message || 'Ошибка при отправке'
    // Родителя могли удалить, пока писали ответ — перечитываем список, чтобы
    // человек увидел, что отвечать уже некому.
    await refresh()
  }
  finally {
    replySending.value = false
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

const revealedSpoilers = ref<Set<number>>(new Set())
const reveal = (id: number) => {
  revealedSpoilers.value = new Set([...revealedSpoilers.value, id])
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
        v-if="!auth.isAuthed"
        v-model="authorName"
        type="text"
        placeholder="Твоё имя"
        maxlength="40"
      >
      <NuxtLink v-if="showLogin && !auth.isAuthed" :to="loginHref" class="comment-login-hint">
        Войти, чтобы подписывать комментарии своим именем
      </NuxtLink>
      <div class="textarea-wrap">
        <textarea
          ref="textareaRef"
          v-model="body"
          :placeholder="placeholder ?? 'Напиши комментарий...'"
          maxlength="500"
        />
        <div class="emoji-trigger-wrap">
          <button class="emoji-trigger" type="button" @click.stop="showEmoji = showEmoji === 'main' ? null : 'main'">
            😊
          </button>
          <ClientOnly>
            <emoji-picker
              v-if="showEmoji === 'main'"
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

    <!-- Ветка: корневой комментарий и ответы под ним. Разметка у них общая,
         ответ отличается только отступом — оттого и один v-for на оба. -->
    <div v-for="t in visibleThreads" :key="t.root.id" class="comment-thread">
      <div
        v-for="c in [t.root, ...t.replies]"
        :key="c.id"
        class="comment-item"
        :class="{ 'is-reply': c.parentId != null }"
      >
        <img v-if="c.avatarUrl" :src="c.avatarUrl" class="comment-avatar comment-avatar--img" :alt="c.authorName">
        <div v-else class="comment-avatar display">{{ c.authorName[0].toUpperCase() }}</div>
        <div class="comment-content">
          <span class="comment-name">{{ c.authorName }}</span>
          <span v-if="answeredName(c)" class="in-reply">в ответ {{ answeredName(c) }}</span>
          <span v-if="c.isSpoiler" class="spoiler-badge">[спойлер]</span>
          <span class="comment-time">{{ timeAgo(c.createdAt) }}</span>
          <div
            class="comment-body"
            :class="{ 'is-spoiler': c.isSpoiler && !revealedSpoilers.has(c.id) }"
            @click="c.isSpoiler && !revealedSpoilers.has(c.id) && reveal(c.id)"
          >
            {{ c.body }}
          </div>
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
            <button class="comment-reply" @click="startReply(c, t.root.id)">Ответить</button>
            <button
              v-if="auth.isAdmin"
              class="comment-delete"
              @click="remove(c.id)"
            >Удалить</button>
          </div>
        </div>
      </div>

      <!-- Форма ответа раскрывается под своей веткой, одна на всю страницу:
           две открытые формы читались бы как два разных разговора. -->
      <div v-if="replyTo && replyTo.rootId === t.root.id" class="reply-form">
        <div class="reply-to">
          Ответ <b>{{ replyTo.name }}</b>
          <button class="reply-cancel" type="button" @click="cancelReply">отменить</button>
        </div>
        <input
          v-if="!auth.isAuthed"
          v-model="replyName"
          type="text"
          placeholder="Твоё имя"
          maxlength="40"
        >
        <div class="textarea-wrap">
          <textarea
            ref="replyTextareaRef"
            v-model="replyBody"
            placeholder="Напиши ответ..."
            maxlength="500"
            @keydown.esc="cancelReply"
          />
          <div class="emoji-trigger-wrap">
            <button class="emoji-trigger" type="button" @click.stop="showEmoji = showEmoji === 'reply' ? null : 'reply'">
              😊
            </button>
            <ClientOnly>
              <emoji-picker
                v-if="showEmoji === 'reply'"
                class="dark emoji-panel"
                @emoji-click="onEmojiClick"
              />
            </ClientOnly>
          </div>
        </div>
        <div class="reply-footer">
          <span v-if="replyError" class="comment-error">{{ replyError }}</span>
          <span v-else class="comment-hint">до 500 символов</span>
          <button
            class="btn-send"
            :disabled="!replyBody.trim() || replySending"
            @click="sendReply"
          >
            {{ replySending ? '...' : 'Ответить' }}
          </button>
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
}

.comments-count {
  font-size: 12px;
  color: var(--text-muted);
}

.comments-note {
  font-size: 12px;
  color: var(--text-muted);
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

.comment-login-hint {
  align-self: flex-start;
  font-size: 12px;
  color: var(--ember-soft);
  opacity: .75;
  text-decoration: none;
}

.comment-login-hint:hover {
  opacity: 1;
  text-decoration: underline;
}

.textarea-wrap {
  position: relative;
}

.comment-form textarea {
  width: 100%;
  min-height: 64px;
  resize: none;
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
  color: var(--text-muted);
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

@media (max-width: 480px) {
  .emoji-panel {
    position: fixed;
    top: auto;
    bottom: 16px;
    right: auto;
    left: 50%;
    transform: translateX(-50%);
    max-width: calc(100vw - 24px);
    --num-columns: 7;
  }
}

.spoiler-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--parchment-2);
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
  color: var(--text-muted);
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
  color: var(--text-muted);
  margin-left: 8px;
}

.comment-body {
  font-size: 13.5px;
  color: var(--parchment-2);
  margin-top: 4px;
  line-height: 1.6;
  overflow-wrap: break-word;
  word-break: break-word;
  min-width: 0;
  position: relative;
  transition: filter .2s;
}

.comment-body.is-spoiler {
  filter: blur(5px);
  cursor: pointer;
  user-select: none;
}

.comment-body.is-spoiler:hover {
  filter: blur(3px);
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
  color: var(--text-muted);
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
  color: var(--text-muted);
  cursor: pointer;
  margin-left: auto;
}

.comment-delete:hover {
  color: #c66;
  opacity: 1;
}

/* ── Ветки: комментарий и ответы под ним ────── */

/* Черта отделяет разговор целиком, а не каждую реплику: иначе ответ читается
   как ещё один самостоятельный комментарий, а не как продолжение. */
.comment-thread {
  border-bottom: 1px solid rgba(241, 230, 210, .07);
}

.comment-thread .comment-item {
  border-bottom: none;
}

/* Ответ сдвинут ровно на ширину аватарки с её отступом (32 + 12) — так он
   встаёт под текстом того, кому отвечают, а не под его картинкой. */
.comment-item.is-reply {
  margin-left: 44px;
  padding-top: 0;
  padding-bottom: 12px;
}

.comment-item.is-reply .comment-avatar {
  width: 24px;
  height: 24px;
  font-size: 11px;
}

/* «в ответ Имя» — приглушённой строчкой рядом с подписью: это уточнение к
   имени автора, а не отдельная мысль. */
.in-reply {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-left: 6px;
}

.comment-reply {
  background: none;
  border: none;
  padding: 0 4px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: color .15s;
}

.comment-reply:hover {
  color: var(--ember-soft);
}

/* ── Форма ответа ───────────────────────────── */

.reply-form {
  margin: 0 0 16px 44px;
}

.reply-to {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.reply-to b {
  color: var(--parchment-2);
  font-weight: 600;
}

.reply-cancel {
  background: none;
  border: none;
  padding: 0;
  margin-left: 8px;
  font-size: 11px;
  color: var(--text-muted);
  text-decoration: underline;
  cursor: pointer;
}

.reply-cancel:hover {
  color: var(--ember-soft);
}

.reply-form input[type="text"] {
  width: 100%;
  max-width: 200px;
  padding: 8px 11px;
  font-size: 13px;
  margin-bottom: 8px;
}

.reply-form textarea {
  width: 100%;
  min-height: 52px;
  resize: none;
  /* Справа место под кнопку смайлов, как в основной форме. */
  padding: 10px 38px 10px 12px;
  font-size: 13.5px;
  line-height: 1.6;
  margin-bottom: 8px;
}

.reply-form input[type="text"],
.reply-form textarea {
  display: block;
  background: rgba(241, 230, 210, .05);
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: 6px;
  color: var(--parchment);
  font-family: var(--font-body);
}

.reply-form input::placeholder,
.reply-form textarea::placeholder {
  color: var(--text-muted);
}

.reply-form input:focus-visible,
.reply-form textarea:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

.reply-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

/* На телефоне отступ ветки режет и без того узкую строку — хватает и половины. */
@media (max-width: 480px) {
  .comment-item.is-reply { margin-left: 22px; }
  .reply-form { margin-left: 22px; }
}

.show-more-btn {
  display: block;
  width: 100%;
  margin-top: 16px;
  padding: 10px;
  background: none;
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
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
