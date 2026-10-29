<script setup lang="ts">
/**
 * Правила «Карт таверны» — свёрнутым блоком. Цифры берём из движка, чтобы
 * правила не разъезжались с игрой, когда поменяем баланс.
 */
import {
  CARD_HEROES, CARD_HERO_IDS, CARDS, CARD_IDS, ATTACK_COST, SKILL_COST, BURST_COST, SWITCH_COST,
  DICE_PER_ROUND, HAND_START, HAND_MAX, DRAW_PER_ROUND,
} from '#shared/utils/cards'

defineProps<{ open?: boolean }>()

const dice = (n: number) => `${n} ${n === 1 ? 'кубик' : n < 5 ? 'кубика' : 'кубиков'}`
</script>

<template>
  <details class="rules card card--panel" :open="open">
    <summary>Правила</summary>

    <h3>Цель</h3>
    <p>Вывести из боя всех трёх героев соперника.</p>

    <h3>Отряд</h3>
    <p>
      У каждого три героя. Сражается один — <b>активный</b> (он приподнят и обведён цветом своей стихии).
      Остальные ждут: по ним бьют только удары «по всем» и реакции. Активного можно сменить.
      Если он падает, ты бесплатно выбираешь, кто выйдет вместо него.
    </p>

    <h3>Раунд</h3>
    <ol>
      <li>
        В начале раунда у тебя <b>{{ DICE_PER_ROUND }} кубиков</b> (колонка справа). Грани — стихии твоего отряда
        и золотой ★ «Любой», он подходит подо что угодно. Отметь лишние кубики и перебрось их — один раз.
      </li>
      <li>
        Дальше ходите по очереди. <b>Удар, навык, ульта, смена героя и «Закончить раунд»</b> — это ход:
        после него ходит соперник. <b>Сыграть карту</b> или <b>перекрасить ею кубик</b> можно сколько угодно
        раз — очередь от этого не переходит.
      </li>
      <li>
        Когда кубики кончились или делать больше нечего — жми «Закончить раунд». Если соперник уже закончил,
        ты ходишь подряд, пока тоже не закончишь.
      </li>
      <li>
        Раунд кончается, когда закончили оба. Тогда бьёт скелет, жжёт яд и тает лёд; каждый берёт
        {{ DRAW_PER_ROUND }} карты и получает новые {{ DICE_PER_ROUND }} кубиков. Первым ходит тот, кто раньше закончил прошлый раунд.
      </li>
    </ol>

    <h3>Что стоит ход</h3>
    <table class="costs">
      <tbody>
        <tr><td>Атака</td><td>{{ ATTACK_COST.el }} кубик стихии героя + {{ ATTACK_COST.any }} любой</td><td>2 урона</td></tr>
        <tr><td>Навык</td><td>{{ dice(SKILL_COST.el!) }} стихии героя</td><td>свой у каждого героя</td></tr>
        <tr><td>Ульта</td><td>{{ dice(BURST_COST.el!) }} стихии героя + полная энергия</td><td>самый сильный удар</td></tr>
        <tr><td>Смена героя</td><td>{{ dice(SWITCH_COST.any!) }}, любой</td><td></td></tr>
        <tr><td>Карта</td><td>цена в золотом кружке; без кружка — бесплатно</td><td></td></tr>
      </tbody>
    </table>
    <p>
      <b>Энергия</b> — кружки под героем. Атака и навык дают по одной, ульта тратит все.
      <b>Перекрасить кубик</b>: любую карту из руки можно сжечь, и один уже имеющийся кубик чужой стихии станет кубиком
      стихии активного героя. Новых кубиков это не даёт: если все кубики уже подходят или их не осталось, перекрашивать нечего.
    </p>

    <h3>Стихии и реакции</h3>
    <p>
      Удар стихией оставляет на цели <b>метку</b> — значок стихии в углу портрета: 🔥 Огонь, ❄ Лёд, ✦ Магия, ☣ Яд. Следующий удар другой
      стихией по этой метке может дать реакцию, и метка уходит.
    </p>
    <ul>
      <li><b>Огонь + Лёд — Таяние:</b> +2 урона.</li>
      <li><b>Огонь + Яд — Взрыв:</b> +1 урон и по 1 урону остальным героям соперника.</li>
      <li><b>Магия + Яд — Нейтрализация:</b> +1 урон, с цели слетают щит и усиления.</li>
      <li><b>Ветер по метке — Рассеивание:</b> стихия метки разлетается по 1 урону на остальных героев соперника.</li>
      <li>Другие пары реакции не дают: старая метка просто меняется на новую.</li>
      <li><b>Сталь</b> меток не оставляет и в реакции не вступает. <b>Ветер</b> своей метки тоже не оставляет.</li>
    </ul>

    <h3>Состояния</h3>
    <ul>
      <li><b>🛡 Щит</b> (внизу слева на портрете) — сначала урон снимает щит, потом здоровье.</li>
      <li><b>☠ Яд</b> (зелёная дымка, число — сколько раундов осталось) — в конце каждого раунда 1 урон Ядом.</li>
      <li><b>Заморожен</b> (портрет во льду) — до конца раунда не может бить; его можно сменить.</li>
      <li><b>⚔ +N</b> (внизу слева) — следующий удар героя сильнее на N.</li>
      <li><b>Скелет</b> (ульта Пишеса) — 3 раунда бьёт активного врага на 1 Магией в конце раунда.</li>
    </ul>

    <h3>Герои</h3>
    <ul>
      <li v-for="id in CARD_HERO_IDS" :key="id">
        <b>{{ CARD_HEROES[id].name }}</b> ({{ CARD_HEROES[id].role.toLowerCase() }}, ❤ {{ CARD_HEROES[id].hp }}).
        Навык «{{ CARD_HEROES[id].skill.name }}»: {{ CARD_HEROES[id].skill.text.toLowerCase() }}.
        Ульта «{{ CARD_HEROES[id].burst.name }}» ({{ CARD_HEROES[id].energy }} энергии): {{ CARD_HEROES[id].burst.text.toLowerCase() }}.
      </li>
    </ul>

    <h3>Карты</h3>
    <p>В начале партии {{ HAND_START }} карт, в руке не больше {{ HAND_MAX }}. В колоде по две копии каждой карты, а редких — по одной.</p>
    <ul>
      <li v-for="c in CARD_IDS" :key="c">
        <b>{{ CARDS[c].name }}</b> ({{ CARDS[c].cost ? dice(CARDS[c].cost) : 'бесплатно' }}<template v-if="CARDS[c].rare">, редкая</template>): {{ CARDS[c].text.toLowerCase() }}.
      </li>
    </ul>
  </details>
</template>

<style scoped>
.rules { margin-top: 12px; font-size: 14px; line-height: 1.55; }
.rules summary { cursor: pointer; font-weight: 600; }
.rules h3 { margin: 16px 0 6px; font-family: var(--font-display); font-size: 17px; color: var(--ember-soft); }
.rules p { margin: 0 0 8px; color: var(--text-muted); }
.rules b { color: var(--parchment); font-weight: 600; }
.rules ul, .rules ol { margin: 0 0 8px; padding-left: 20px; color: var(--text-muted); }
.rules li + li { margin-top: 4px; }

.costs { border-collapse: collapse; margin: 0 0 8px; color: var(--text-muted); }
.costs td { padding: 4px 12px 4px 0; vertical-align: top; }
.costs td:first-child { color: var(--parchment); font-weight: 600; white-space: nowrap; }
</style>
