<script setup lang="ts">
/**
 * Уведомления читателя — значком справа внизу. В шапке места нет: на телефоне
 * там уже бургер и аватарка. Здесь значок виден с любой страницы и появляется
 * только у вошедших — гостю уведомления класть некуда.
 */

type Item = {
  id: number
  isRead: boolean
  createdAt: string
  commentId: number
  chapterId: string | null
  authorName: string
  body: string
  avatarUrl: string | null
  answeredBody: string | null
}

const auth = useAuthStore()
const route = useRoute()

const open = ref(false)
const items = ref<Item[]>([])
const unread = ref(0)
const loading = ref(false)

/** Шар уехал за край, пока читают вниз. Держим рядом с остальным состоянием:
 *  наблюдатель с immediate уже однажды дёрнул объявление, стоявшее ниже. */
const tucked = ref(false)

const load = async () => {
  if (!auth.isAuthed) {
    items.value = []
    unread.value = 0
    return
  }

  loading.value = true
  try {
    const data = await $fetch<{ unread: number, items: Item[] }>('/api/notifications')
    items.value = data.items
    unread.value = data.unread
  }
  catch {
    // Молча: не загрузились — значок просто не покажет числа, а страница цела.
  }
  finally {
    loading.value = false
  }
}

/*
  Уезжает шар только на странице главы — там он висит прямо над текстом. На
  остальных страницах читать нечего, а исчезающий значок пришлось бы искать.

  Считаем по кускам пути, а не регуляркой: у читалки он /chapter/:id — ровно два
  куска, — а у комментариев главы /chapter/:id/comments, где их три. Так видно,
  что именно сравнивается, и не надо escape-ить слэши.
*/
const isChapterPage = computed(() => {
  const parts = route.path.split('/').filter(Boolean)
  return parts.length === 2 && parts[0] === 'chapter'
})

/** Куда ведёт уведомление: к комментариям главы или к отзывам на главной. */
const hrefOf = (n: Item) => n.chapterId ? `/chapter/${n.chapterId}/comments` : '/#reviews'

const openItem = async (n: Item) => {
  open.value = false

  // Убираем из списка сразу, не дожидаясь сервера: человек уже открыл, и ящик
  // должен опустеть в тот же миг. Не дошло до сервера — строка вернётся при
  // следующей загрузке, это не потеря.
  if (!n.isRead) {
    items.value = items.value.filter(x => x.id !== n.id)
    unread.value = Math.max(0, unread.value - 1)
    try { await $fetch('/api/notifications/read', { method: 'POST', body: { id: n.id } }) }
    catch {}
  }

  await navigateTo(hrefOf(n))
}

const readAll = async () => {
  unread.value = 0
  items.value = []
  try { await $fetch('/api/notifications/read', { method: 'POST' }) }
  catch {}
}

const toggle = () => {
  open.value = !open.value
  if (open.value) {
    tucked.value = false
    load()
  }
}

/*
  Живой пуш. Свой сокет, а не тот, что открывают комментарии: значок висит на
  всех страницах, а комнату главы ему слушать незачем — отсюда notify=1.

  Комната личная, поэтому по адресу её не дают: сначала берём одноразовый билет
  обычным запросом (там кука, и сервер знает, кто спрашивает), потом предъявляем
  билет сообщением. С сервера приходит только «загляни ещё раз» — сам список
  перечитываем обычным обработчиком, чтобы выдержка и спойлер собирались в одном
  месте.
*/
let ws: WebSocket | null = null
let retry = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let closedByUs = false

const connect = async () => {
  if (!import.meta.client || typeof WebSocket === 'undefined') return
  if (!auth.isAuthed || ws) return

  let ticket: string
  try {
    ticket = (await $fetch<{ ticket: string }>('/api/notifications/ws-ticket')).ticket
  }
  catch {
    // Не дали билет — живём на обновлении по переходам и возврату во вкладку.
    return
  }

  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const socket = new WebSocket(`${proto}://${location.host}/_ws?notify=1`)
  ws = socket

  socket.onopen = () => {
    retry = 0
    socket.send(JSON.stringify({ subscribe: ticket }))
  }

  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg?.type === 'notification') load()
    }
    catch {}
  }

  socket.onclose = () => {
    ws = null
    if (closedByUs || !auth.isAuthed) return

    // Отвалилось — пробуем снова, всё реже: 2, 4, 8… но не дольше минуты.
    // Билет одноразовый, поэтому каждый раз берём новый.
    const delay = Math.min(2000 * 2 ** retry, 60_000)
    retry++
    retryTimer = setTimeout(connect, delay)
  }

  socket.onerror = () => {
    try { socket.close() } catch {}
  }
}

const disconnect = () => {
  closedByUs = true
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  try { ws?.close() } catch {}
  ws = null
}

// Вернулись во вкладку — перечитываем. Страховка на случай, когда сокет отвалился
// незаметно: телефон засыпает и рвёт соединения, о которых браузер не сообщает.
const onVisible = () => {
  if (document.visibilityState === 'visible' && auth.isAuthed) load()
}

// Обновляем при входе и на переходах между страницами: таймера нет — читатель и
// так ходит по главам, а лишние запросы в фоне телефону ни к чему.
watch(() => auth.isAuthed, (authed) => {
  load()
  if (authed) { closedByUs = false; connect() }
  else disconnect()
}, { immediate: true })
watch(() => route.fullPath, () => {
  // Ушли со главы спрятанным — на новой странице шар должен быть виден.
  tucked.value = false
  lastY = 0
  if (auth.isAuthed) load()
})

/*
  Читатель ведёт страницу вниз — шар уезжает за край, ведёт вверх — возвращается.
  На главе он висел прямо над текстом и мешал читать, а прятать его насовсем
  нельзя: тогда о новом ответе узнаешь только уйдя со страницы.

  Мелкие подрагивания пропускаем: без порога шар дёргался бы от каждого касания.
  У самого верха держим на виду — там ещё не читают.
*/
let lastY = 0

/** Меньше этого считаем дрожанием пальца, а не прокруткой. */
const JITTER = 6

/** Пока не отъехали от начала, шар не убираем. */
const TOP_ZONE = 120

const onScroll = () => {
  const y = window.scrollY
  const dy = y - lastY

  if (Math.abs(dy) < JITTER) return
  lastY = y

  // Не глава — шар стоит на месте. Открытую панель тоже не прячем: человек её
  // сейчас читает.
  if (!isChapterPage.value || open.value) { tucked.value = false; return }

  tucked.value = dy > 0 && y > TOP_ZONE
}

/*
  На узком экране панель раскрывается на весь экран. Тогда страница под ней не
  должна ехать: иначе палец, ведущий список, уносит за собой главу. Порог тот
  же, что в стилях, — держим их в одном числе, чтобы не разъезжались.

  useScrollLock тут не годится: он вешается на монтирование, а значок висит на
  странице всегда и открывается лишь иногда.
*/
const FULLSCREEN_MAX = 560

watch(open, (isOpen) => {
  if (!import.meta.client) return

  const full = window.matchMedia(`(max-width: ${FULLSCREEN_MAX}px)`).matches
  document.body.style.overflow = isOpen && full ? 'hidden' : ''
})

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') open.value = false
}

const onOutside = (e: MouseEvent) => {
  const el = document.querySelector('.notif-widget')
  if (el && !el.contains(e.target as Node)) open.value = false
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('click', onOutside)
  document.addEventListener('visibilitychange', onVisible)
  lastY = window.scrollY
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onOutside)
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('scroll', onScroll)
  // Уходим со страницы с открытой панелью — прокрутку надо вернуть.
  if (import.meta.client) document.body.style.overflow = ''
  disconnect()
})
</script>

<template>
  <div v-if="auth.isAuthed" class="notif-widget" :class="{ tucked, 'is-open': open }">
    <Transition name="notif-panel">
      <div v-if="open" class="panel" role="dialog" aria-label="Уведомления">
        <div class="panel-head">
          <span class="panel-title">Уведомления</span>
          <button v-if="unread > 0" class="read-all" type="button" @click="readAll">
            прочитать все
          </button>
          <!-- На весь экран «снаружи» нет, и закрыть панель больше нечем. -->
          <button class="panel-close" type="button" aria-label="Закрыть" @click="open = false">×</button>
        </div>

        <p v-if="loading && !items.length" class="panel-note">Смотрим…</p>
        <p v-else-if="!items.length" class="panel-note">
          Пока тихо. Здесь появятся ответы на твои комментарии.
        </p>

        <ul v-else class="list">
          <li v-for="n in items" :key="n.id">
            <button class="item" type="button" @click="openItem(n)">
              <UserAvatar
                class="item-pic"
                :src="n.avatarUrl"
                :name="n.authorName"
                :frame="n.avatarFrame"
                :size="28"
                alt=""
              />
              <span class="item-text">
                <span class="item-top">
                  <b>{{ n.authorName }}</b> ответил
                  <span class="item-time">{{ timeAgo(n.createdAt) }}</span>
                </span>
                <span class="item-body">{{ n.body }}</span>
                <!-- Своя реплика — напоминание, о чём был разговор. У ответов,
                     написанных до появления столбца, её нет. -->
                <span v-if="n.answeredBody" class="item-answered">
                  на твоё «{{ n.answeredBody }}»
                </span>
              </span>
            </button>
          </li>
        </ul>
      </div>
    </Transition>

    <button
      class="orb-btn"
      :class="{ 'has-unread': unread > 0 }"
      type="button"
      :aria-label="unread ? `Уведомления, непрочитанных: ${unread}` : 'Уведомления'"
      @click.stop="toggle"
    >
      <NuxtImg src="/orb.webp" class="orb" width="56" height="64" alt="" />
      <span class="glow" aria-hidden="true" />
      <span v-if="unread > 0" class="badge">{{ unread > 9 ? '9+' : unread }}</span>
    </button>
  </div>
</template>

<style scoped>
.notif-widget {
  position: fixed;
  right: 18px;
  /* Над жест-баром телефона: без safe-area значок ложится под системную полосу. */
  bottom: calc(18px + env(safe-area-inset-bottom));
  z-index: 90;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  transition: transform .25s ease, opacity .25s ease;
}

/* Пока панель открыта, виджет поднимается над шапкой сайта (у неё z-index 100):
   иначе раскрытая на весь экран панель уходила бы под неё верхним краем. */
.notif-widget.is-open { z-index: 200; }

/* Уезжает за правый край вместе со своим отступом, чтобы не осталось края. */
.notif-widget.tucked {
  transform: translateX(calc(100% + 18px));
  opacity: 0;
  pointer-events: none;
}

/* Кому анимация мешает — шар просто исчезает и появляется. */
@media (prefers-reduced-motion: reduce) {
  .notif-widget { transition: none; }
}

/* ── Шар ────────────────────────────────────── */

/* Кнопка без своей рамки и фона: шар нарисован сам по себе, круг вокруг него
   выглядел бы второй окантовкой поверх стеклянной. */
.orb-btn {
  position: relative;
  width: 56px;
  padding: 0;
  border: none;
  background: none;
  line-height: 0;
  cursor: pointer;
  transition: transform .15s;
}

.orb-btn:hover { transform: translateY(-2px); }

.orb {
  display: block;
  width: 100%;
  height: auto;
  /* Тень под шаром, чтобы он стоял, а не висел. Фильтр висит на картинке, а не
     на кнопке: на кнопке он накрыл бы группой и слой свечения. */
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, .45));
}

/*
  Свет ВНУТРИ стекла — отдельным слоем поверх картинки.

  Наложение обычное, не screen. Сначала было screen, и свечения не было видно
  вовсе: середина шара почти белая, а screen только добавляет света — добавлять
  к белому нечего. Проверено композитом поверх самой orb.webp.

  Круг посажен по шару, а не по картинке: шар — окружность во всю ширину с
  центром на 43% высоты, ниже начинается подставка. Замерено профилем
  непрозрачности orb.webp (на 72% высоты расчёт даёт 143px, замер — 140px).
  Диаметр берём чуть меньше стекла, а к краю градиент уходит в ноль — поэтому
  кромка и блики остаются на месте, светится именно глубина.
*/
.glow {
  position: absolute;
  left: 50%;
  top: 43%;
  width: 92%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle at 50% 50%,
    rgba(226, 176, 255, .97) 0%,
    rgba(176, 82, 255, .92) 20%,
    rgba(138, 28, 250, .72) 46%,
    rgba(104, 0, 235, 0) 76%);
  opacity: 0;
  pointer-events: none;
}

.orb-btn.has-unread .glow {
  animation: orb-glow 2.2s ease-in-out infinite;
}

@keyframes orb-glow {
  0%, 100% { opacity: .45; }
  50% { opacity: 1; }
}

/* Наружу фиолетовый не выходит: под шаром остаётся только своя тёмная тень,
   чтобы он стоял на странице, а не висел. Весь свет — внутри стекла. */

/* Кому мигание мешает — шар светится ровно, смысл не теряется. */
@media (prefers-reduced-motion: reduce) {
  .orb-btn.has-unread .glow {
    animation: none;
    opacity: .8;
  }
}

.badge {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--ember);
  color: var(--bg-dark);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}

/* ── Панель ─────────────────────────────────── */
.panel {
  width: min(340px, calc(100vw - 36px));
  max-height: min(60vh, 420px);
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .14);
  border-radius: var(--radius-md);
  box-shadow: 0 10px 30px rgba(0, 0, 0, .45);
  scrollbar-width: thin;
  scrollbar-color: rgba(241, 230, 210, .22) transparent;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(241, 230, 210, .1);
  position: sticky;
  top: 0;
  background: var(--bg-dark-2);
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--parchment);
  flex: 1;
}

.read-all {
  background: none;
  border: none;
  padding: 0;
  font-size: 11.5px;
  color: var(--text-muted);
  text-decoration: underline;
  cursor: pointer;
}

.read-all:hover { color: var(--ember-soft); }

/* Крестик нужен только раскрытой на весь экран панели: в маленькой закрывает
   клик мимо неё. */
.panel-close {
  display: none;
  background: none;
  border: none;
  padding: 0 2px;
  font-size: 22px;
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
}

.panel-close:hover { color: var(--parchment); }

.panel-note {
  margin: 0;
  padding: 18px 14px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-muted);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.item {
  display: flex;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 11px 14px;
  background: none;
  border: none;
  border-bottom: 1px solid rgba(241, 230, 210, .06);
  cursor: pointer;
  transition: background .15s;
}

.item:hover { background: rgba(241, 230, 210, .04); }

.item-pic {
  background: linear-gradient(135deg, var(--ember-soft), var(--moss));
  color: var(--bg-dark);
}

.item-text {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.item-top {
  font-size: 12px;
  color: var(--parchment-2);
}

.item-top b {
  color: var(--parchment);
  font-weight: 600;
}

.item-time {
  color: var(--text-muted);
  margin-left: 4px;
}

.item-body {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-muted);
  /* Две строки и многоточие: уведомление — не место читать ответ целиком. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Своя реплика — тише самого ответа: это подпись, а не новость. */
.item-answered {
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--text-muted);
  opacity: .7;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/*
  Узкий экран: панель на весь экран, а не форточкой в углу. В списке помещается
  вся десятка, выдержки не режутся до одной строки, и палец не промахивается.

  position: fixed внутри .notif-widget работает потому, что transform у него
  появляется только в спрятанном виде, а открытой панели спрятанным быть нельзя
  — иначе fixed считался бы от виджета, а не от окна.
*/
@media (max-width: 560px) {
  .panel {
    position: fixed;
    inset: 0;
    width: 100%;
    max-width: none;
    height: 100%;
    max-height: none;
    border: none;
    border-radius: 0;
    box-shadow: none;
    display: flex;
    flex-direction: column;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .panel-head {
    padding: 16px 16px 14px;
  }

  .panel-title { font-size: 16px; }

  .panel-close { display: block; }

  .list {
    flex: 1;
    overflow-y: auto;
  }

  .item { padding: 14px 16px; }

  /* На весь экран места хватает: выдержку из ответа не режем до двух строк. */
  .item-body { -webkit-line-clamp: 3; }
}

.notif-panel-enter-active,
.notif-panel-leave-active {
  transition: opacity .18s ease, transform .18s ease;
}

.notif-panel-enter-from,
.notif-panel-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
