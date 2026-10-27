<script setup lang="ts">
/**
 * Стол «Карт таверны» на двоих. Партия на сервере (server/utils/cards-rooms.ts),
 * сюда приходит её вид глазами игрока. Пока за столом один — ссылка для
 * друга и выбор отряда; оба выбрали — партия начинается.
 */
import type { HeroId } from '#shared/utils/cards'

const route = useRoute()
const code = String(route.params.code).toUpperCase()

const { data: settings } = await useFetch('/api/settings')
useHead({ title: `Стол ${code} · Карты таверны`, meta: [{ name: 'robots', content: 'noindex' }] })

const { room, connected, fatal, notice, needName, nameError, joinAs, team, act, rematch, say, leave } = useCardsRoom(code)
const guestNameInput = ref('')

const picked = ref<HeroId[]>([])
const me = computed(() => room.value?.seats[room.value.you])
const foe = computed(() => room.value?.seats[1 - (room.value?.you ?? 0)])
// Отряд, выбранный раньше (переподключился), — снова в выборе.
watch(me, (s) => { if (s?.team && !picked.value.length) picked.value = [...s.team] }, { immediate: true })

const link = computed(() => (import.meta.client ? `${location.origin}/cards/${code}` : `/cards/${code}`))
const copied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {}
}

/** Счёт — с первой доигранной партии, как в настольной игре. */
const score = computed(() => (room.value?.games ? room.value.seats : []))

function quit() {
  const g = room.value?.game
  if (g && g.phase !== 'over' && !confirm('Выйти из партии? Победа достанется сопернику.')) return
  leave()
  navigateTo('/board')
}
</script>

<template>
  <div class="page">
    <AppHeader
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />

    <main v-if="fatal" class="lobby">
      <h1 class="page-title title">Карты таверны</h1>
      <p class="lead">{{ fatal }}</p>
      <div class="actions"><NuxtLink to="/board" class="btn btn--ghost">К столам</NuxtLink></div>
    </main>

    <main v-else-if="needName" class="lobby">
      <section class="card card--panel guest">
        <h1 class="guest-title display">Как тебя звать за столом?</h1>
        <form class="guest-form" @submit.prevent="joinAs(guestNameInput)">
          <input v-model="guestNameInput" class="guest-input" maxlength="40" placeholder="Имя" autocomplete="nickname">
          <button class="btn btn--primary" type="submit" :disabled="!guestNameInput.trim()">Сесть за стол</button>
        </form>
        <p v-if="nameError" class="error">{{ nameError }}</p>
      </section>
    </main>

    <main v-else-if="!room" class="lobby">
      <p class="note">Садимся за стол…</p>
    </main>

    <!-- Партия -->
    <main v-else-if="room.game" class="wrap">
      <p v-if="!connected" class="notice">Связь пропала, переподключаемся…</p>
      <p v-else-if="foe && !foe.online && room.game.phase !== 'over'" class="notice">{{ foe.name }} отключился — ждём, пока вернётся</p>
      <p v-if="notice" class="notice">{{ notice }}</p>
      <div v-if="score.length" class="score">
        <span class="score-title">Счёт · партий {{ room.games }}</span>
        <span v-for="(s, i) in score" :key="i" class="score-item" :class="{ 'score-item--me': i === room.you }">{{ s.name }} <b>{{ s.wins }}</b></span>
      </div>
      <CardsTable :game="room.game" @act="act" @leave="quit">
        <template #over>
          <button class="btn btn--primary" :disabled="me?.rematch || !connected" @click="rematch">
            {{ me?.rematch ? `Ждём, что скажет ${foe?.name ?? 'соперник'}…` : 'Реванш' }}
          </button>
          <span v-if="foe?.rematch && !me?.rematch" class="note">{{ foe.name }} хочет реванш</span>
          <button class="btn btn--ghost" @click="quit">Выйти</button>
        </template>
      </CardsTable>
      <CardsChat :messages="room.chat" :you="room.you" :disabled="!connected" @say="say" />
      <CardsRules />
    </main>

    <!-- Сбор за столом -->
    <main v-else class="lobby">
      <header class="intro">
        <div class="eyebrow">Карты таверны · стол {{ code }}</div>
        <h1 class="page-title title">Стол на двоих</h1>
        <p v-if="!foe" class="lead">Отправь другу ссылку — как только он сядет и оба выберут отряд, начнётся партия.</p>
        <p v-else class="lead">За столом {{ me?.name }} и {{ foe.name }}. Выберите отряды — партия начнётся сама.</p>
      </header>

      <div v-if="!foe" class="share card card--panel">
        <code class="share-link">{{ link }}</code>
        <button class="btn btn--primary btn--sm" @click="copyLink">{{ copied ? 'Скопировано' : 'Скопировать ссылку' }}</button>
      </div>

      <ul class="seats">
        <li v-for="(s, i) in room.seats" :key="i" class="seat">
          <span class="seat-name">{{ s.name }}<template v-if="i === room.you"> (ты)</template></span>
          <span class="seat-state" :class="{ 'seat-state--ok': s.team }">{{ s.team ? 'отряд выбран' : 'выбирает отряд' }}</span>
          <span v-if="!s.online" class="seat-state">не в сети</span>
        </li>
      </ul>

      <p v-if="notice" class="notice">{{ notice }}</p>

      <CardsPicker v-model="picked">
        <div class="actions">
          <button class="btn btn--primary" :disabled="picked.length !== 3 || !connected" @click="team(picked)">
            {{ me?.team ? 'Сменить отряд' : 'Готов' }}
          </button>
          <button class="btn btn--ghost" @click="quit">Уйти из-за стола</button>
        </div>
      </CardsPicker>
      <CardsChat :messages="room.chat" :you="room.you" :disabled="!connected" @say="say" />
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

.lobby,
.wrap {
  flex: 1;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 96px 16px 48px;
}

.intro { margin-bottom: 24px; }

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

.section-title {
  margin: 28px 0 12px;
  font-size: 22px;
}

.note { color: var(--text-muted); font-size: 14px; }

.actions { margin: 20px 0; }

.notice {
  margin: 0 0 10px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  background: var(--fill-strong);
  font-size: 14px;
}

.error { color: var(--danger); margin: 10px 0 0; }

/* Счёт стола — строкой над полем. */
.score {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 14px;
  margin: 0 0 10px;
  font-size: 14px;
}

.score-title { color: var(--text-muted); }
.score-item b { color: var(--gold); margin-left: 4px; }
.score-item--me { color: var(--success); }

.actions { display: flex; flex-wrap: wrap; gap: 10px; }

.share {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.share-link {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 14px;
  color: var(--parchment-2);
}

.seats {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: grid;
  gap: 6px;
}

.seat {
  display: flex;
  gap: 12px;
  align-items: baseline;
  flex-wrap: wrap;
}

.seat-name { font-family: var(--font-display); font-size: 18px; }
.seat-state { font-size: 13px; color: var(--text-muted); }
.seat-state--ok { color: var(--success); }

.guest { max-width: 480px; }
.guest-title { margin: 0 0 14px; font-size: 22px; }
.guest-form { display: flex; gap: 8px; flex-wrap: wrap; }

.guest-input {
  flex: 1;
  min-width: 160px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--line-strong);
  background: var(--fill);
  color: var(--parchment);
  font: inherit;
}
</style>
