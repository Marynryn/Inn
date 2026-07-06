<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'

const props = defineProps<{
  chapterId: string
  chapterTitle: string
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const loading = ref(true)
const saving = ref(false)
const saveError = ref('')
const saved = ref(false)
const isPublished = ref(true)

const editor = useEditor({
  content: '',
  editable: true,
  extensions: [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      strike: false,
      code: false,
    }),
    TextStyle,
    Color,
  ],
})

// Цвет текста там, где сейчас курсор/выделение — у разных фрагментов он разный,
// это не единый цвет документа. Нужен для подсветки текущего цвета в тулбаре.
const currentColor = computed(() => editor.value?.getAttributes('textStyle').color || '#e7d9c2')

onMounted(async () => {
  try {
    const chapter = await $fetch<{ contentHtml: string, isPublished: boolean }>(`/api/chapters/${props.chapterId}`)
    editor.value?.commands.setContent(chapter.contentHtml || '')
    isPublished.value = chapter.isPublished
  } catch {
    saveError.value = 'Не удалось загрузить текст главы'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

// --- Поиск и замена ---
const showSearch = ref(false)
const searchTerm = ref('')
const replaceTerm = ref('')
const matches = ref<{ from: number; to: number }[]>([])
const currentMatchIndex = ref(0)

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const findMatches = () => {
  matches.value = []
  currentMatchIndex.value = 0
  if (!editor.value || !searchTerm.value) return
  const re = new RegExp(escapeRegex(searchTerm.value), 'gi')
  editor.value.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    re.lastIndex = 0
    let match
    while ((match = re.exec(node.text))) {
      matches.value.push({ from: pos + match.index, to: pos + match.index + match[0].length })
      if (match[0].length === 0) re.lastIndex++
    }
  })
}

const selectMatch = (index: number, focusEditor = false) => {
  const m = matches.value[index]
  if (!m || !editor.value) return
  const chain = editor.value.chain()
  if (focusEditor) chain.focus()
  chain.setTextSelection(m).scrollIntoView().run()
}

const runSearch = () => {
  // Не забираем фокус у поля поиска, пока пользователь ещё печатает —
  // иначе курсор перескакивает в текст главы после первой же буквы.
  findMatches()
  if (matches.value.length) selectMatch(0, false)
}

const nextMatch = () => {
  if (!matches.value.length) { runSearch(); return }
  currentMatchIndex.value = (currentMatchIndex.value + 1) % matches.value.length
  selectMatch(currentMatchIndex.value, true)
}

const prevMatch = () => {
  if (!matches.value.length) return
  currentMatchIndex.value = (currentMatchIndex.value - 1 + matches.value.length) % matches.value.length
  selectMatch(currentMatchIndex.value, true)
}

const replacementContent = () => (replaceTerm.value ? [{ type: 'text', text: replaceTerm.value }] : [])

const replaceCurrent = () => {
  const m = matches.value[currentMatchIndex.value]
  if (!m || !editor.value) return
  editor.value.chain().focus().insertContentAt(m, replacementContent()).run()
  findMatches()
  if (matches.value.length) {
    currentMatchIndex.value = Math.min(currentMatchIndex.value, matches.value.length - 1)
    selectMatch(currentMatchIndex.value, true)
  }
}

const replaceAll = () => {
  if (!editor.value || !matches.value.length) return
  // Заменяем с конца документа к началу, чтобы уже обработанные позиции не съезжали
  const sorted = [...matches.value].sort((a, b) => b.from - a.from)
  let chain = editor.value.chain().focus()
  for (const m of sorted) {
    chain = chain.insertContentAt(m, replacementContent())
  }
  chain.run()
  findMatches()
}

const toggleSearch = () => {
  showSearch.value = !showSearch.value
  if (!showSearch.value) {
    matches.value = []
    searchTerm.value = ''
    replaceTerm.value = ''
  }
}

const save = async () => {
  if (!editor.value) return
  saving.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/admin/chapters/${props.chapterId}`, {
      method: 'PUT',
      body: { contentHtml: editor.value.getHTML(), isPublished: isPublished.value },
    })
    saved.value = true
    emit('saved')
    setTimeout(() => { saved.value = false }, 2000)
  } catch (e: any) {
    saveError.value = e.data?.message || 'Не удалось сохранить'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('close')">
      <div class="modal">
        <div class="modal-head">
          <h2>Редактировать главу {{ chapterId }}</h2>
          <button class="modal-close" title="Закрыть" @click="emit('close')">✕</button>
        </div>
        <p class="modal-subtitle">{{ chapterTitle }}</p>

        <label v-if="!loading" class="checkbox-row">
          <input v-model="isPublished" type="checkbox">
          <span>Опубликовано (видно всем читателям)</span>
        </label>

        <div v-if="loading" class="loading-hint">Загрузка текста главы...</div>

        <template v-else>
          <div class="toolbar">
            <button
              type="button"
              class="tb-btn"
              :class="{ active: editor?.isActive('bold') }"
              title="Жирный"
              @click="editor?.chain().focus().toggleBold().run()"
            ><b>Ж</b></button>
            <button
              type="button"
              class="tb-btn"
              :class="{ active: editor?.isActive('italic') }"
              title="Курсив"
              @click="editor?.chain().focus().toggleItalic().run()"
            ><i>К</i></button>
            <button
              type="button"
              class="tb-btn"
              title="Разделитель"
              @click="editor?.chain().focus().setHorizontalRule().run()"
            >—</button>
            <span class="tb-sep" />
            <label class="color-picker" title="Цвет текста выделения">
              <input
                type="color"
                :value="currentColor"
                @input="editor?.chain().focus().setColor(($event.target as HTMLInputElement).value).run()"
              >
            </label>
            <button
              type="button"
              class="tb-btn"
              title="Убрать цвет"
              @click="editor?.chain().focus().unsetColor().run()"
            >✕</button>
            <span class="tb-sep" />
            <button type="button" class="tb-btn" title="Отменить" @click="editor?.chain().focus().undo().run()">↶</button>
            <button type="button" class="tb-btn" title="Повторить" @click="editor?.chain().focus().redo().run()">↷</button>
            <span class="tb-sep" />
            <button
              type="button"
              class="tb-btn"
              :class="{ active: showSearch }"
              title="Найти и заменить"
              @click="toggleSearch"
            >🔍</button>
          </div>

          <div v-if="showSearch" class="search-bar">
            <input
              v-model="searchTerm"
              type="text"
              placeholder="Найти..."
              class="search-input"
              @input="runSearch"
              @keydown.enter.prevent="nextMatch"
            >
            <input
              v-model="replaceTerm"
              type="text"
              placeholder="Заменить на..."
              class="search-input"
            >
            <span class="match-count">
              {{ !searchTerm ? '' : matches.length ? `${currentMatchIndex + 1} из ${matches.length}` : 'не найдено' }}
            </span>
            <button type="button" class="tb-btn" title="Предыдущее" :disabled="!matches.length" @click="prevMatch">◀</button>
            <button type="button" class="tb-btn" title="Следующее" :disabled="!matches.length" @click="nextMatch">▶</button>
            <button type="button" class="btn-cancel btn-xs" :disabled="!matches.length" @click="replaceCurrent">Заменить</button>
            <button type="button" class="btn-cancel btn-xs" :disabled="!matches.length" @click="replaceAll">Заменить всё</button>
          </div>

          <EditorContent :editor="editor" class="editor-body" />
        </template>

        <div v-if="saveError" class="form-error">{{ saveError }}</div>

        <div class="modal-actions">
          <button class="btn-cancel" @click="emit('close')">Отмена</button>
          <button class="btn-save" :disabled="loading || saving" @click="save">
            {{ saved ? '✓ Сохранено' : saving ? 'Сохраняем...' : 'Сохранить' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(20, 14, 10, .7);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 24px;
}

.modal {
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: var(--radius-md);
  padding: 24px 28px;
  max-width: 760px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-head h2 {
  margin: 0;
  font-size: 18px;
  color: var(--parchment);
}

.modal-close {
  background: none;
  border: none;
  color: var(--parchment-2);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
}

.modal-close:hover {
  color: var(--ember-soft);
}

.modal-subtitle {
  margin: 4px 0 16px;
  font-size: 13px;
  color: var(--parchment-2);
  opacity: .75;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--parchment-2);
  margin: -8px 0 16px;
  cursor: pointer;
}

.loading-hint {
  padding: 40px 0;
  text-align: center;
  color: var(--parchment-2);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(241, 230, 210, .1);
}

.tb-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(241, 230, 210, .18);
  background: none;
  color: var(--parchment-2);
  cursor: pointer;
  font-size: 14px;
}

.tb-btn:hover {
  border-color: var(--ember-soft);
  color: var(--ember-soft);
}

.tb-btn.active {
  background: var(--ember);
  color: var(--bg-dark);
  border-color: var(--ember);
}

.color-picker {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(241, 230, 210, .18);
  overflow: hidden;
  display: flex;
  cursor: pointer;
}

.color-picker input[type="color"] {
  width: 40px;
  height: 40px;
  margin: -4px;
  border: none;
  cursor: pointer;
  padding: 0;
  background: none;
}

.tb-sep {
  width: 1px;
  height: 20px;
  background: rgba(241, 230, 210, .15);
  margin: 0 4px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 0 12px;
  flex-wrap: wrap;
}

.search-input {
  background: rgba(241, 230, 210, .05);
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-sm);
  color: var(--parchment);
  padding: 6px 10px;
  font-size: 13px;
  font-family: var(--font-body);
  width: 160px;
}

.search-input:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

.match-count {
  font-size: 12px;
  color: var(--parchment-2);
  opacity: .7;
  white-space: nowrap;
  min-width: 70px;
}

.btn-xs {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-cancel:disabled {
  opacity: .4;
  cursor: default;
}

.editor-body {
  flex: 1;
  overflow-y: auto;
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: var(--radius-sm);
  padding: 16px;
  color: #e7d9c2;
  min-height: 300px;
}

.editor-body :deep(.ProseMirror) {
  outline: none;
  min-height: 280px;
}

.editor-body :deep(p) {
  margin: 0 0 14px;
  line-height: 1.7;
}

.form-error {
  margin-top: 12px;
  color: #d97070;
  font-size: 13px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.btn-cancel {
  background: none;
  border: 1px solid rgba(241, 230, 210, .2);
  color: var(--parchment-2);
  padding: 9px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.btn-save {
  background: var(--ember);
  border: none;
  color: var(--bg-dark);
  padding: 9px 18px;
  border-radius: var(--radius-sm);
  font-weight: 500;
  cursor: pointer;
}

.btn-save:disabled {
  opacity: .6;
  cursor: default;
}
</style>
