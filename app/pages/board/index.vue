<script setup lang="ts">
import { isCardsCode } from '#shared/utils/cards'

/**
 * Вход в настольные игры: свои незаконченные партии, открытые комнаты и
 * кнопка «новая комната». Играть может любой вошедший; ссылка в меню — только
 * у админов, остальных зовут на стол ссылкой.
 *
 * Здесь же «Карты таверны»: пока они в разработке, стол для них накрывает
 * только админ, а друг садится по ссылке.
 */

type RoomsReply = {
  rooms: { code: string; host: string | null; players: number; max: number }[]
  mine: string | null
  /** Создавать стол может только вошедший; гость садится за чужой. */
  canCreate: boolean
}

const { data: settings } = await useFetch('/api/settings')
const { data, refresh, pending } = await useFetch<RoomsReply>('/api/board/rooms')

const auth = useAuthStore()
const creating = ref(false)
const error = ref('')
const codeInput = ref('')

async function create() {
  creating.value = true
  error.value = ''
  try {
    const { code } = await $fetch<{ code: string }>('/api/board/rooms', { method: 'POST' })
    await navigateTo(`/board/${code}`)
  } catch (e: any) {
    error.value = e?.data?.message || 'Не получилось накрыть стол'
  } finally {
    creating.value = false
  }
}

async function createCards() {
  creating.value = true
  error.value = ''
  try {
    const { code } = await $fetch<{ code: string }>('/api/cards/rooms', { method: 'POST' })
    await navigateTo(`/cards/${code}`)
  } catch (e: any) {
    error.value = e?.data?.message || 'Не получилось накрыть стол'
  } finally {
    creating.value = false
  }
}

// Код карт на букву длиннее — по длине и понимаем, куда вести.
function joinByCode() {
  const code = codeInput.value.trim().toUpperCase()
  if (!code) return
  navigateTo(isCardsCode(code) ? `/cards/${code}` : `/board/${code}`)
}

// Список комнат живой: пока страница открыта, подтягиваем раз в несколько секунд.
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => refresh(), 5000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

// Заход — в счётчик «разных людей» в админке. Шлёт ожившая страница, а не
// сервер: скрапер без JS сюда не дойдёт. Не дошло — не беда.
onMounted(() => { $fetch('/api/board/visit', { method: 'POST', body: { visitor: visitorId() } }).catch(() => {}) })

useHead({ title: 'Настольные игры · Странствующая Таверна', meta: [{ name: 'robots', content: 'noindex' }] })
</script>

<template>
  <div class="page">
    <AppHeader
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />

    <main class="lobby">
      <header class="intro">
        <div class="eyebrow">The Wandering Inn</div>
        <h1 class="page-title title">Настольные игры</h1>
        <p class="lead">Выбери игру и накрой стол — друзей зовут ссылкой. Или сядь за чужой стол по коду.</p>
      </header>

      <section v-if="data?.mine" class="card card--panel mine">
        <span>Ты сидишь за столом <b>{{ data.mine }}</b>, партия не закончена.</span>
        <NuxtLink :to="`/board/${data.mine}`" class="btn btn--primary btn--sm">Вернуться</NuxtLink>
      </section>

      <div class="games">
        <section class="card card--panel game">
          <h2 class="game-title display">Дорога через таверну</h2>
          <p class="game-lead">
            Бросай кубик и веди фишку по событиям первого тома. Кто первым дойдёт до финиша, тот и победил.
            За одним столом до четырёх игроков.
          </p>
          <div class="actions">
            <button v-if="data?.canCreate" class="btn btn--primary" :disabled="creating" @click="create">
              {{ creating ? 'Накрываем стол…' : 'Новый стол' }}
            </button>
            <NuxtLink v-else :to="`/login?next=${encodeURIComponent('/board')}`" class="btn btn--ghost">Войти, чтобы накрыть свой стол</NuxtLink>
          </div>
        </section>

        <section v-if="auth.isAdmin" class="card card--panel game">
          <h2 class="game-title display">Карты таверны <span class="badge">для админов</span></h2>
          <p class="game-lead">
            Отряд из трёх героев, кубики стихий и реакции. Пока в разработке: стол накрывает админ, друг садится по ссылке.
          </p>
          <div class="actions">
            <button class="btn btn--primary" :disabled="creating" @click="createCards">Стол на двоих</button>
            <NuxtLink to="/cards" class="btn btn--ghost">Против компьютера</NuxtLink>
          </div>
        </section>
      </div>

      <form class="by-code" @submit.prevent="joinByCode">
        <input v-model="codeInput" class="code-input" placeholder="Код стола" maxlength="6" autocomplete="off">
        <button class="btn btn--ghost" type="submit" :disabled="!codeInput.trim()">Сесть за стол</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>

      <h2 class="section-title display">Открытые столы</h2>
      <p v-if="pending && !data" class="note">Смотрим, кто за столами…</p>
      <p v-else-if="!data?.rooms.length" class="note">Свободных столов нет. Создай свой и позови друзей ссылкой.</p>
      <ul v-else class="rooms">
        <li v-for="r in data.rooms" :key="r.code" class="card card--panel room">
          <div>
            <div class="room-code">{{ r.code }}</div>
            <div class="room-meta">Хозяин стола: {{ r.host ?? '—' }} · игроков {{ r.players }} из {{ r.max }}</div>
          </div>
          <NuxtLink :to="`/board/${r.code}`" class="btn btn--ghost btn--sm">Сесть за стол</NuxtLink>
        </li>
      </ul>
    </main>

    <AppFooter on-dark :settings="settings as any" />
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg-dark);
  color: var(--parchment);
  display: flex;
  flex-direction: column;
}

.lobby {
  flex: 1;
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  padding: 96px 20px 64px;
}

.intro { margin-bottom: 28px; }

.eyebrow {
  font-size: 12px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ember-soft);
  margin-bottom: 12px;
}

.title { margin: 0 0 12px; }

.lead {
  margin: 0;
  max-width: 640px;
  color: var(--text-muted);
  line-height: 1.6;
}

.mine {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.by-code {
  display: flex;
  gap: 8px;
}

.code-input {
  width: 140px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--line-strong);
  background: var(--fill);
  color: var(--parchment);
  font: inherit;
  text-transform: uppercase;
  letter-spacing: .12em;
}

.error { color: var(--danger); margin: 12px 0 0; }

.games {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.game { display: flex; flex-direction: column; gap: 10px; }
.game-title { margin: 0; font-size: 22px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.game-lead { margin: 0; flex: 1; color: var(--text-muted); font-size: 14px; line-height: 1.5; }

.badge {
  font-family: var(--font-body);
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--fill-bold);
  color: var(--ember-soft);
}

.section-title {
  margin: 36px 0 12px;
  font-size: 22px;
}

.note { color: var(--text-muted); }

.rooms {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.room {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.room-code {
  font-family: var(--font-display);
  font-size: 20px;
  letter-spacing: .12em;
}

.room-meta {
  font-size: 14px;
  color: var(--text-muted);
}
</style>
