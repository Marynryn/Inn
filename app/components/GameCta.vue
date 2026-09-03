<script setup lang="ts">
/**
 * Плашка про игру — стоит перед оглавлением и не спорит с главным действием
 * страницы: читать. Тексты редактируются в админке, значения тут — запасные.
 */
const props = defineProps<{
  title?: string
  text?: string
  maxVolume?: string
}>()

const heading = computed(() => props.title || 'Кто из таверны?')

/**
 * {том} в тексте подставляется из настройки игры: обещание «без спойлеров»
 * должно двигаться вместе с переводом, а не устаревать в ручном тексте.
 */
const body = computed(() => {
  const raw = props.text
    || 'Угадай персонажа по признакам: вид, занятие, том появления. Новый — каждый день, и только те, кто встречался до {том} тома.'

  return raw.replace(/\{том\}/g, props.maxVolume || '10')
})
</script>

<template>
  <aside class="game-cta">
    <CornerLeaves />

    <span class="game-mark display" aria-hidden="true">!</span>

    <div class="game-body">
      <p class="game-title display">{{ heading }}</p>
      <p class="game-sub">{{ body }}</p>
    </div>

    <NuxtLink href="/game" class="game-btn">Играть</NuxtLink>
  </aside>
</template>

<style scoped>
/* Держим форму телеграм-плашки из оглавления: два одинаковых по смыслу блока
   на одной странице не должны выглядеть по-разному. */
.game-cta {
  /* Листья свисают за верхний край и подрезаются им */
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 22px;
  border: 1px solid rgba(43, 30, 22, .14);
  border-left: 3px solid var(--ember);
  border-radius: var(--radius-md);
  background: rgba(214, 136, 62, .06);
}

/* Восклицательный знак заголовочным шрифтом: он тут вместо иконки, поэтому
   крупный и в цвет акцента. */
.game-mark {
  flex: none;
  align-self: center;
  font-size: 40px;
  font-weight: 600;
  line-height: 1;
  color: var(--ember);
  padding: 0 6px;
}

.game-body {
  flex: 1;
  min-width: 0;
}

.game-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}

.game-sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-soft);
}

.game-btn {
  /* над листьями: горсть заходит под кнопку, а не на неё */
  position: relative;
  z-index: 1;
  flex: none;
  padding: 10px 18px;
  border-radius: var(--radius-sm);
  background: var(--ember);
  color: var(--bg-dark);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transition: background .15s;
}

.game-btn:hover {
  background: var(--ember-soft);
}

@media (max-width: 620px) {
  .game-cta {
    flex-wrap: wrap;
    gap: 12px;
    padding: 16px;
  }

  .game-body {
    /* Ширина знака с отступами плюс зазор — чтобы текст встал рядом, а не под ним. */
    flex-basis: calc(100% - 64px);
  }

  .game-btn {
    width: 100%;
    text-align: center;
  }
}
</style>
