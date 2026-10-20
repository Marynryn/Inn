<script setup lang="ts">
/**
 * Своё сообщение в телеграм-канал: написать и отправить. Отправка — в два
 * нажатия: сообщение сразу видят все подписчики, и отозвать его отсюда нельзя.
 */
const TEXT_MAX = 4096

const text = ref('')
const confirming = ref(false)
const sending = ref(false)
const result = ref('')
const error = ref('')

const trimmed = computed(() => text.value.trim())

const textEl = ref<HTMLTextAreaElement | null>(null)

watch(text, () => {
  confirming.value = false
  result.value = ''
})

const send = async () => {
  if (!confirming.value) {
    confirming.value = true
    return
  }

  sending.value = true
  error.value = ''
  try {
    await $fetch('/api/admin/notify/custom', { method: 'POST', body: { text: text.value } })
    // Сначала чистим поле — watch сбросит результат, — и только потом пишем его.
    text.value = ''
    await nextTick()
    result.value = '✓ Отправлено в канал'
  } catch (e: any) {
    error.value = e?.data?.message || 'Не удалось отправить'
  } finally {
    sending.value = false
    confirming.value = false
  }
}
</script>

<template>
  <div class="tg-post">
    <h3 class="tg-sub">Своё сообщение</h3>
    <p class="tg-hint">
      Уходит в тот же канал, что и главы. Разметка как в телеграме: **жирный**, ~~зачёркнутый~~,
      ||спойлер|| — или выдели слова и нажми кнопку. Ссылки станут кликабельными сами.
    </p>

    <AdminTgMarks v-model="text" :target="textEl" :max="TEXT_MAX" />

    <textarea
      ref="textEl"
      v-model="text"
      class="tg-text thin-scroll"
      rows="6"
      :maxlength="TEXT_MAX"
      placeholder="В таверне заработал барабан! Раз в день можно попытать удачу и выиграть рамку для аватарки."
      aria-label="Текст сообщения в телеграм"
    />
    <div class="tg-foot">
      <span class="tg-count">{{ text.length }}/{{ TEXT_MAX }}</span>
    </div>

    <p v-if="error" class="tg-err">{{ error }}</p>

    <div class="tg-actions">
      <button class="btn" :class="confirming ? 'btn--danger' : 'btn--primary'" type="button" :disabled="sending || !trimmed" @click="send">
        {{ sending ? 'Отправляем...' : confirming ? 'Да, отправить всем подписчикам' : 'Отправить в канал' }}
      </button>
      <button v-if="confirming && !sending" class="tg-link" type="button" @click="confirming = false">Отмена</button>
      <span v-if="result" class="tg-ok">{{ result }}</span>
    </div>
  </div>
</template>

<style scoped>
.tg-post {
  margin-top: 28px;
  padding-top: 22px;
  border-top: 1px solid var(--line);
}

.tg-sub {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 500;
}

.tg-hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: rgba(241, 230, 210, .55);
}

.tg-text {
  width: 100%;
  height: 140px;
  padding: 10px 12px;
  resize: none;
  overflow-y: auto;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--fill);
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.55;
}

.tg-text:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

.tg-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.tg-count {
  font-size: 11px;
  color: rgba(241, 230, 210, .4);
  font-variant-numeric: tabular-nums;
}

.tg-err {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--danger);
}

.tg-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.tg-link {
  padding: 0;
  border: none;
  background: none;
  color: var(--ember-soft);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
}

.tg-ok {
  font-size: 13px;
  color: var(--ember-soft);
}
</style>
