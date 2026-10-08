<script setup lang="ts">
import type { AvatarFrame } from '#shared/utils/avatarFrames'

/**
 * Личная переписка админов: слева собеседники, справа разговор с выбранным.
 * Собеседник хранится в адресе (?with=12) — по нему открывает разговор и
 * строка колокольчика. На телефоне колонки не помещаются: там либо список,
 * либо разговор с кнопкой «назад».
 *
 * Всё грузится уже в браузере: время сообщений показываем по часам читающего,
 * и сервер, не знающий его часового пояса, нарисовал бы другое.
 */
type Person = {
  id: number
  name: string
  avatarUrl: string | null
  avatarFrame: AvatarFrame | null
  online: boolean
  unread: boolean
  last: { id: number, mine: boolean, body: string, createdAt: string } | null
}
type Message = { id: number, mine: boolean, body: string, createdAt: string }
type Thread = { with: Omit<Person, 'online' | 'unread' | 'last'>, items: Message[] }

const MAX = 2000

const route = useRoute()
const { refresh: refreshUnread } = useAdminUnread()

const people = ref<Person[]>([])
const listState = ref<'loading' | 'ready' | 'error'>('loading')
const thread = ref<Thread | null>(null)
const threadState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

const peerId = computed(() => {
  const n = Number(route.query.with)
  return Number.isInteger(n) && n > 0 ? n : null
})
const peer = computed(() => people.value.find(p => p.id === peerId.value) ?? null)

const loadPeople = async () => {
  try {
    people.value = await $fetch<Person[]>('/api/admin/messages')
    listState.value = 'ready'
  }
  catch {
    if (listState.value === 'loading') listState.value = 'error'
  }
}

const scroller = ref<HTMLElement | null>(null)
const toBottom = async () => {
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}

/** quiet — перечитать без «Загружаем…»: новое сообщение не должно мигать экраном. */
const loadThread = async (quiet = false) => {
  const id = peerId.value
  if (!id) { thread.value = null; threadState.value = 'idle'; return }
  if (!quiet) threadState.value = 'loading'
  try {
    const data = await $fetch<Thread>(`/api/admin/messages/${id}`)
    if (peerId.value !== id) return // пока грузилось, выбрали другого
    thread.value = data
    threadState.value = 'ready'
    // Разговор открыт — значит, прочитан: гасим отметки в списке и на вкладке.
    const p = people.value.find(x => x.id === id)
    if (p) p.unread = false
    refreshUnread()
    toBottom()
  }
  catch {
    if (!quiet) threadState.value = 'error'
  }
}

const choose = (id: number | null) =>
  navigateTo({ query: { ...route.query, with: id ?? undefined } }, { replace: true })

watch(peerId, () => { draft.value = ''; loadThread() })

onMounted(async () => {
  await loadPeople()
  // На широком экране сразу открываем самый свежий разговор — пустая правая
  // половина ничего не даёт. На телефоне начинаем со списка.
  if (!peerId.value && people.value[0]?.last && window.matchMedia('(min-width: 721px)').matches) {
    choose(people.value[0].id)
  }
  else loadThread()
})

// Живое: сообщение пришло мне или ушло от меня из другой вкладки.
notifyBus.on((msg) => {
  if (msg?.type !== 'message') return
  const other = msg.from === peerId.value || msg.to === peerId.value
  if (other && document.visibilityState === 'visible') loadThread(true)
  loadPeople()
})

// Вернулись во вкладку — то, что пришло, пока её не видели, стало прочитанным.
const onVisible = () => {
  if (document.visibilityState === 'visible' && peerId.value) loadThread(true)
}
onMounted(() => document.addEventListener('visibilitychange', onVisible))
onUnmounted(() => document.removeEventListener('visibilitychange', onVisible))

// ── Отправка ───────────────────────────────────
const draft = ref('')
const sending = ref(false)
const sendError = ref('')
const field = ref<HTMLTextAreaElement | null>(null)

const send = async () => {
  const id = peerId.value
  const body = draft.value.trim()
  if (!id || !body || sending.value) return
  sending.value = true
  sendError.value = ''
  try {
    const m = await $fetch<Message>(`/api/admin/messages/${id}`, { method: 'POST', body: { body } })
    draft.value = ''
    // Сокет пришлёт то же сообщение ещё раз — отсюда проверка по id.
    if (thread.value && !thread.value.items.some(x => x.id === m.id)) thread.value.items.push(m)
    toBottom()
    loadPeople()
  }
  catch (e: any) {
    sendError.value = e?.data?.message || 'Не отправилось — попробуй ещё раз'
  }
  finally {
    sending.value = false
    nextTick(() => field.value?.focus())
  }
}

// Enter отправляет, Shift+Enter — новая строка, как в любом мессенджере.
// Пока набирается слово через IME, Enter принадлежит ему.
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  }
}

// Поле растёт с текстом, но не выше трети экрана — дальше прокрутка внутри.
watch(draft, async () => {
  await nextTick()
  const el = field.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, window.innerHeight / 3)}px`
})

// ── Смайлы ─────────────────────────────────────
const showEmoji = ref(false)
if (import.meta.client) import('emoji-picker-element')

const onEmoji = (e: any) => {
  const emoji = e.detail?.emoji?.unicode ?? ''
  showEmoji.value = false
  if (!emoji) return
  const el = field.value
  if (!el) { draft.value += emoji; return }
  const start = el.selectionStart ?? draft.value.length
  const end = el.selectionEnd ?? draft.value.length
  draft.value = draft.value.slice(0, start) + emoji + draft.value.slice(end)
  nextTick(() => {
    el.selectionStart = el.selectionEnd = start + emoji.length
    el.focus()
  })
}

const onOutside = (e: MouseEvent) => {
  if (!(e.target as HTMLElement | null)?.closest?.('.emoji-wrap')) showEmoji.value = false
}
onMounted(() => document.addEventListener('click', onOutside))
onUnmounted(() => document.removeEventListener('click', onOutside))

// ── Время ──────────────────────────────────────
const toDate = (iso: string) => new Date(iso.replace(' ', 'T') + 'Z')
const clock = (iso: string) => toDate(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const dayKey = (iso: string) => toDate(iso).toDateString()

/** Подпись дня над сообщениями: «Сегодня», «Вчера» или число. */
const dayLabel = (iso: string) => {
  const d = toDate(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

/** В списке собеседников — время последнего: сегодня часами, раньше датой. */
const lastWhen = (iso: string) =>
  dayKey(iso) === new Date().toDateString()
    ? clock(iso)
    : toDate(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
</script>

<template>
  <div class="dm" :class="{ 'has-peer': peerId }">
    <p v-if="listState === 'loading'" class="note">Смотрим…</p>
    <p v-else-if="listState === 'error'" class="note">Список не загрузился. Обнови страницу.</p>
    <p v-else-if="!people.length" class="note">
      Других админов пока нет — писать некому. Завести нового админа можно во вкладке «Аккаунт».
    </p>

    <template v-else>
      <!-- Собеседники -->
      <ul class="people thin-scroll">
        <li v-for="p in people" :key="p.id">
          <button class="person" :class="{ active: p.id === peerId }" type="button" @click="choose(p.id)">
            <span class="ava">
              <UserAvatar :src="p.avatarUrl" :name="p.name" :frame="p.avatarFrame" :size="36" alt="" />
              <span v-if="p.online" class="online" title="Сейчас на сайте" aria-label="Сейчас на сайте" />
            </span>
            <span class="who">
              <span class="name-row">
                <span class="name">{{ p.name }}</span>
                <span v-if="p.last" class="when">{{ lastWhen(p.last.createdAt) }}</span>
              </span>
              <span class="preview" :class="{ unread: p.unread }">
                <template v-if="p.last"><span v-if="p.last.mine" class="you">Вы: </span>{{ p.last.body }}</template>
                <template v-else>Ещё не переписывались</template>
              </span>
            </span>
            <span v-if="p.unread" class="unread-dot" aria-label="Есть непрочитанное" />
          </button>
        </li>
      </ul>

      <!-- Разговор -->
      <section class="chat" :aria-label="peer ? `Переписка с ${peer.name}` : 'Переписка'">
        <p v-if="!peerId" class="chat-empty">Выбери, кому написать.</p>

        <template v-else>
          <header class="chat-head">
            <button class="back" type="button" aria-label="К списку" @click="choose(null)">
              <NavIcon name="back" />
            </button>
            <template v-if="thread || peer">
              <UserAvatar
                :src="(thread?.with ?? peer)!.avatarUrl"
                :name="(thread?.with ?? peer)!.name"
                :frame="(thread?.with ?? peer)!.avatarFrame"
                :size="32"
                alt=""
              />
              <span class="chat-who">
                <b>{{ (thread?.with ?? peer)!.name }}</b>
                <span class="chat-status">{{ peer?.online ? 'на сайте' : 'не на сайте' }}</span>
              </span>
            </template>
          </header>

          <div ref="scroller" class="log thin-scroll" data-clarity-mask="true">
            <p v-if="threadState === 'loading'" class="note">Загружаем…</p>
            <p v-else-if="threadState === 'error'" class="note">Переписка не загрузилась.</p>
            <p v-else-if="thread && !thread.items.length" class="chat-empty">Сообщений пока нет.</p>
            <template v-for="(m, i) in thread?.items ?? []" v-else :key="m.id">
              <div v-if="i === 0 || dayKey(m.createdAt) !== dayKey(thread!.items[i - 1]!.createdAt)" class="day">
                {{ dayLabel(m.createdAt) }}
              </div>
              <div class="msg" :class="{ mine: m.mine }">
                <p class="bubble">{{ m.body }}<span class="time">{{ clock(m.createdAt) }}</span></p>
              </div>
            </template>
          </div>

          <form class="composer" @submit.prevent="send">
            <div class="field-wrap">
              <textarea
                id="dm-draft"
                ref="field"
                v-model="draft"
                rows="1"
                :maxlength="MAX"
                placeholder="Сообщение…"
                aria-label="Сообщение"
                class="thin-scroll"
                @keydown="onKey"
              />
              <div class="emoji-wrap">
                <button class="emoji-btn" type="button" aria-label="Смайлы" @click.stop="showEmoji = !showEmoji">😊</button>
                <ClientOnly>
                  <emoji-picker v-if="showEmoji" class="dark emoji-panel" @emoji-click="onEmoji" />
                </ClientOnly>
              </div>
            </div>
            <button class="send" type="submit" :disabled="!draft.trim() || sending" aria-label="Отправить">
              <NavIcon name="send" />
            </button>
          </form>
          <p v-if="sendError" class="send-error">{{ sendError }}</p>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* Две колонки на всю высоту окна за вычетом шапки сайта, полей страницы и
   карточки с заголовком: разговор прокручивается внутри себя, а поле ввода
   всегда на виду. Высота — видимая (dvh): на телефоне 100vh включает спрятанные
   панели браузера, и поле ввода уезжало под нижнюю. vh — запас для старых
   браузеров без dvh. */
.dm {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  height: calc(100vh - 240px);
  height: calc(100dvh - 240px);
  min-height: 320px;
  border: 1px solid rgba(241, 230, 210, .08);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.note {
  margin: 0;
  padding: 16px;
  font-size: 13px;
  color: rgba(241, 230, 210, .55);
}

.dm > .note {
  grid-column: 1 / -1;
}

/* ── Собеседники ─────────────────────────────── */
.people {
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
  border-right: 1px solid rgba(241, 230, 210, .08);
  background: rgba(0, 0, 0, .12);
}

.person {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--parchment);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.person:hover {
  background: rgba(241, 230, 210, .05);
}

.person.active {
  background: rgba(214, 136, 62, .14);
}

.person:focus-visible {
  outline: 2px solid var(--ember-soft);
  outline-offset: -2px;
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
  border-radius: 50%;
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

.name-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.when {
  flex: none;
  font-size: 11px;
  color: rgba(241, 230, 210, .4);
}

.preview {
  font-size: 12.5px;
  color: rgba(241, 230, 210, .5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview.unread {
  color: var(--parchment);
}

.you {
  color: rgba(241, 230, 210, .38);
}

.unread-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ember-soft);
  box-shadow: 0 0 6px rgba(214, 136, 62, .7);
}

/* ── Разговор ────────────────────────────────── */
.chat {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.chat-empty {
  margin: auto;
  padding: 24px;
  font-size: 13px;
  color: rgba(241, 230, 210, .45);
  text-align: center;
}

.chat-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(241, 230, 210, .08);
}

.back {
  display: none;
  padding: 4px;
  border: none;
  background: none;
  color: var(--parchment-2);
  cursor: pointer;
}

.chat-who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}

.chat-who b {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-status {
  font-size: 11.5px;
  color: rgba(241, 230, 210, .45);
}

.log {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.day {
  align-self: center;
  margin: 10px 0 6px;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  color: rgba(241, 230, 210, .55);
  background: rgba(241, 230, 210, .06);
}

.msg {
  display: flex;
}

.msg.mine {
  justify-content: flex-end;
}

/* Пузырь: свои — тёплые справа, чужие — пергаментные слева. Время — в правом
   нижнем углу самого пузыря, как в мессенджерах; место под него держит
   невидимый хвост строки. */
.bubble {
  max-width: min(520px, 78%);
  margin: 0;
  padding: 7px 11px 6px;
  border-radius: 12px 12px 12px 4px;
  background: rgba(241, 230, 210, .08);
  color: var(--parchment);
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.msg.mine .bubble {
  border-radius: 12px 12px 4px 12px;
  background: rgba(214, 136, 62, .22);
}

.time {
  float: right;
  margin: 6px 0 -3px 10px;
  font-size: 10.5px;
  color: rgba(241, 230, 210, .42);
}

/* ── Поле ввода ──────────────────────────────── */
.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid rgba(241, 230, 210, .08);
}

.field-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.field-wrap textarea {
  display: block;
  width: 100%;
  resize: none;
  padding: 9px 40px 9px 12px;
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-md);
  background: rgba(241, 230, 210, .05);
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.4;
}

.field-wrap textarea:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

.emoji-wrap {
  position: absolute;
  right: 8px;
  bottom: 7px;
}

.emoji-btn {
  padding: 2px;
  border: none;
  background: none;
  font-size: 18px;
  line-height: 1;
  opacity: .55;
  cursor: pointer;
  transition: opacity .15s;
}

.emoji-btn:hover {
  opacity: 1;
}

/* Панель смайлов раскрывается вверх: поле ввода прижато к низу карточки. */
.emoji-panel {
  position: absolute;
  right: 0;
  bottom: 32px;
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

.send {
  flex: none;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: var(--ember);
  color: #1f1813;
  cursor: pointer;
  transition: opacity .15s, background .15s;
}

.send:hover:not(:disabled) {
  background: var(--ember-soft);
}

.send:disabled {
  opacity: .35;
  cursor: default;
}

.send:focus-visible {
  outline: 2px solid var(--parchment);
  outline-offset: 2px;
}

.send-error {
  margin: 0;
  padding: 0 14px 10px;
  font-size: 12.5px;
  color: #e08a7a;
}

/* ── Телефон: либо список, либо разговор ─────── */
@media (max-width: 720px) {
  .dm {
    grid-template-columns: 1fr;
    height: calc(100vh - 182px);
    height: calc(100dvh - 182px);
  }

  .people {
    border-right: none;
  }

  .dm.has-peer .people { display: none; }
  .dm:not(.has-peer) .chat { display: none; }

  .back { display: inline-flex; }

  .emoji-panel {
    position: fixed;
    right: auto;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    max-width: calc(100vw - 24px);
    --num-columns: 7;
  }
}
</style>
