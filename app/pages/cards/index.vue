<script setup lang="ts">
/**
 * «Карты таверны» против компьютера. Правила и ход соперника — в
 * shared/utils/cards.ts, стол — CardsTable. Партия живёт в браузере: сервер
 * про неё не знает. Пока карты в разработке, страница только для админов;
 * стол на двоих накрывают в /board.
 */
import { newCardsGame, randomCardsTeam, cardsApply, cardsComputerMove, type Game, type HeroId, type Action } from '#shared/utils/cards'

definePageMeta({ middleware: 'admin' })

const { data: settings } = await useFetch('/api/settings')

useHead({ title: 'Карты таверны · Странствующая Таверна', meta: [{ name: 'robots', content: 'noindex' }] })

const picked = ref<HeroId[]>([])
const game = shallowRef<Game | null>(null)

function start() {
  const seed = Date.now()
  game.value = newCardsGame([...picked.value], randomCardsTeam(seed + 1), seed)
}

function act(a: Action) {
  if (game.value) game.value = cardsApply(game.value, 0, a)
}

// Ход компьютера — с паузой, чтобы было видно, что он делает.
let timer: ReturnType<typeof setTimeout> | null = null
watch(game, (g) => {
  if (timer) clearTimeout(timer)
  if (!g || g.phase !== 'action' || g.choosing !== null || g.turn !== 1) return
  timer = setTimeout(() => {
    const cur = game.value
    if (cur) game.value = cardsApply(cur, 1, cardsComputerMove(cur))
  }, 750)
})
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <div class="page">
    <AppHeader
      :telegram-url="settings?.telegram_url"
      :boosty-url="settings?.boosty_url"
      :tribute-url="settings?.tribute_url"
    />

    <main v-if="!game" class="lobby">
      <header class="intro">
        <div class="eyebrow">Карточная игра · The Wandering Inn</div>
        <h1 class="page-title title">Карты таверны</h1>
        <p class="lead">
          Собери отряд из трёх героев и сразись с компьютером. Кубики стихий — твой ресурс:
          ими платят за удары, навыки и карты. Стихии сталкиваются и дают реакции.
          Сыграть с другом — в <NuxtLink to="/board">настольной игре</NuxtLink>: там накрывают стол на двоих.
        </p>
      </header>

      <CardsPicker v-model="picked">
        <div class="actions">
          <button class="btn btn--primary" :disabled="picked.length !== 3" @click="start">В бой</button>
        </div>
      </CardsPicker>
    </main>

    <main v-else class="wrap">
      <CardsTable :game="game" @act="act" @leave="game = null">
        <template #over>
          <button class="btn btn--primary" @click="start">Ещё партия тем же отрядом</button>
          <button class="btn btn--ghost" @click="game = null">Сменить отряд</button>
        </template>
      </CardsTable>
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

.lead a { color: var(--ember-soft); }
</style>
