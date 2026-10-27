<script setup lang="ts">
/**
 * Чат за столом «Карт таверны» — как в настольной игре: строка ввода,
 * смайлы из той же панели, что в обсуждениях, лента прокручивается к новому.
 */
import { CARDS_CHAT_MAX, type CardsChatMessage } from '#shared/utils/cards'

const props = defineProps<{ messages: CardsChatMessage[]; you: 0 | 1; disabled?: boolean }>()
const emit = defineEmits<{ say: [text: string] }>()

const draft = ref('')
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)

function send() {
  const text = draft.value.trim()
  if (!text) return
  emit('say', text)
  draft.value = ''
}

watch(() => props.messages.length, async () => {
  await nextTick()
  list.value?.scrollTo({ top: list.value.scrollHeight })
}, { immediate: true })

// Смайлы грузим, когда их впервые позвали; не загрузились — закрываем пустую панель.
const showEmoji = ref(false)
let emojiLoad: Promise<unknown> | null = null
watch(showEmoji, (open) => {
  if (!open || emojiLoad) return
  emojiLoad = import('emoji-picker-element').catch(() => {
    emojiLoad = null
    showEmoji.value = false
  })
})

function onEmoji(e: any) {
  const emoji = e.detail?.emoji?.unicode ?? ''
  showEmoji.value = false
  if (!emoji) return
  const el = input.value
  if (!el) { draft.value += emoji; return }
  const start = el.selectionStart ?? draft.value.length
  const end = el.selectionEnd ?? draft.value.length
  draft.value = (draft.value.slice(0, start) + emoji + draft.value.slice(end)).slice(0, CARDS_CHAT_MAX)
  nextTick(() => {
    el.selectionStart = el.selectionEnd = start + emoji.length
    el.focus()
  })
}

const onOutside = (e: MouseEvent) => {
  if (!(e.target as HTMLElement | null)?.closest?.('.emoji-wrap')) showEmoji.value = false
}
onMounted(() => document.addEventListener('click', onOutside))
onBeforeUnmount(() => document.removeEventListener('click', onOutside))

const time = (at: number) => new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <section class="card chat" aria-label="Чат за столом">
    <div ref="list" class="chat-list thin-scroll">
      <p v-if="!messages.length" class="chat-empty">В чате пока тихо.</p>
      <div v-for="m in messages" :key="m.id" class="msg">
        <span class="msg-name" :class="{ 'msg-name--me': m.side === you }">{{ m.name }}</span>
        <span class="msg-time">{{ time(m.at) }}</span>
        <div class="msg-text">{{ m.text }}</div>
      </div>
    </div>
    <form class="chat-form" @submit.prevent="send">
      <input ref="input" v-model="draft" class="chat-input" :maxlength="CARDS_CHAT_MAX" placeholder="Написать за стол…" autocomplete="off">
      <div class="emoji-wrap">
        <button class="emoji-btn" type="button" aria-label="Смайлы" @click.stop="showEmoji = !showEmoji">😊</button>
        <ClientOnly>
          <emoji-picker v-if="showEmoji" class="dark emoji-panel" @emoji-click="onEmoji" />
        </ClientOnly>
      </div>
      <button class="btn btn--primary btn--sm" type="submit" :disabled="disabled || !draft.trim()">↵</button>
    </form>
  </section>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: 260px;
  margin-top: 16px;
}

.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
}

.chat-empty { margin: 0; color: var(--text-muted); font-size: 14px; }

.msg { margin-bottom: 10px; }
.msg-name { font-weight: 600; font-size: 14px; color: var(--ember-soft); }
.msg-name--me { color: var(--success); }
.msg-time { font-size: 12px; color: var(--text-muted); margin-left: 6px; }
.msg-text { font-size: 15px; line-height: 1.45; overflow-wrap: anywhere; }

.emoji-wrap {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
}

.emoji-btn {
  padding: 2px 4px;
  border: none;
  background: none;
  font-size: 18px;
  line-height: 1;
  opacity: .55;
  cursor: pointer;
  transition: opacity .15s;
}

.emoji-btn:hover { opacity: 1; }

/* Панель раскрывается вверх: поле чата внизу карточки. */
.emoji-panel {
  position: absolute;
  right: 0;
  bottom: 36px;
  z-index: var(--z-dropdown);
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

@media (max-width: 600px) {
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

.chat-form {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--line);
}

.chat-input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--line-strong);
  background: var(--fill);
  color: var(--parchment);
  /* 16px — меньше iPhone приближает страницу при фокусе. */
  font: 16px var(--font-body);
}
</style>
