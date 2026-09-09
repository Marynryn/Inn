<script setup lang="ts">
import type { GameMode } from '#shared/utils/gameColumns'

/**
 * Таблица рейтинга поверх страницы игры. Два режима считаются врозь: персонаж
 * дня один на всех и партия там одна в сутки, а свободных партий человек играет
 * сколько захочет.
 */

type Row = {
  name: string
  avatarUrl: string | null
  played: number
  wins: number
  averageGuesses: number
  streak: number
  me: boolean
  place: number
}

const emit = defineEmits<{ close: [] }>()

const mode = ref<GameMode>('daily')
const loading = ref(true)
const error = ref('')

// Вкладку, однажды загруженную, не перезапрашиваем: за время одного окна
// рейтинг не меняется, а переключаться между вкладками хочется мгновенно.
const boards = ref<Partial<Record<GameMode, Row[]>>>({})
const rows = computed(() => boards.value[mode.value] ?? [])

const load = async (value: GameMode) => {
  if (boards.value[value]) return

  loading.value = true
  error.value = ''
  try {
    boards.value[value] = await $fetch<Row[]>('/api/game/leaderboard', { query: { mode: value } })
  } catch {
    error.value = 'Рейтинг не загрузился'
  } finally {
    loading.value = false
  }
}

const switchMode = (value: GameMode) => {
  mode.value = value
  load(value)
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  load('daily')
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => document.removeEventListener('keydown', onKeydown))

useScrollLock()
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click.self="emit('close')">
      <div class="card" role="dialog" aria-modal="true" aria-label="Рейтинг игроков">
        <div class="head">
          <h2 class="title display">Рейтинг</h2>
          <button class="close" type="button" aria-label="Закрыть" @click="emit('close')">×</button>
        </div>

        <div class="tabs">
          <button class="tab" :class="{ active: mode === 'daily' }" type="button" @click="switchMode('daily')">
            Персонаж дня
          </button>
          <button class="tab" :class="{ active: mode === 'endless' }" type="button" @click="switchMode('endless')">
            Свободная игра
          </button>
        </div>

        <p v-if="loading" class="note">В таверне считают победы…</p>
        <p v-else-if="error" class="note err">{{ error }}</p>
        <p v-else-if="!rows.length" class="note">
          Здесь пока пусто. Угадай персонажа — и первая строка будет твоей.
        </p>

        <div v-else class="table-wrap">
          <table class="table">
            <!-- Ширины колонок живут здесь: так подпись «Игрок» может занять
                 сразу две ячейки — аватарку и имя — и начаться там же, где она. -->
            <colgroup>
              <col class="c-place">
              <col class="c-avatar">
              <col>
              <col class="c-num">
              <col class="c-num">
              <col v-if="mode === 'daily'" class="c-num">
            </colgroup>
            <thead>
              <tr>
                <th class="col-place">
                  <span class="place"><span class="place-num">#</span></span>
                </th>
                <th colspan="2">Игрок</th>
                <th class="num">Побед</th>
                <th class="num">Попыток</th>
                <th v-if="mode === 'daily'" class="num">Серия</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in rows"
                :key="row.name"
                :class="{ me: row.me, apart: i > 0 && row.place > rows[i - 1]!.place + 1 }"
              >
                <td class="col-place">
                  <span class="place">
                    <span class="place-num">{{ row.place }}</span>
                    <!-- Тройке призёров — корона: золото, серебро, бронза. -->
                    <svg
                      v-if="row.place <= 3"
                      class="crown"
                      :class="['gold', 'silver', 'bronze'][row.place - 1]"
                      viewBox="0 0 24 18"
                      aria-hidden="true"
                    >
                      <path d="M2 14.5h20L23.2 4l-6.6 4.6L12 2 7.4 8.6.8 4z" />
                      <rect x="2" y="15.4" width="20" height="2.2" rx="1" />
                    </svg>
                  </span>
                </td>
                <td class="col-avatar">
                  <img v-if="row.avatarUrl" :src="row.avatarUrl" class="avatar" alt="">
                  <span v-else class="avatar avatar-letter">{{ row.name[0]?.toUpperCase() }}</span>
                </td>
                <td class="name" :title="row.name">{{ row.name }}</td>
                <td class="num">{{ row.wins }}<span class="of"> из {{ row.played }}</span></td>
                <td class="num">{{ row.averageGuesses || '—' }}</td>
                <td v-if="mode === 'daily'" class="num">{{ row.streak || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="fine">
          Выше тот, у кого больше побед. Побед поровну — впереди тот, кто угадывал за меньшее
          число попыток.
        </p>
        <p v-if="mode === 'daily'" class="fine">
          Серия — сколько дней подряд угадан персонаж дня. Пропущенный день её обрывает,
          а сегодняшняя несыгранная партия — нет.
        </p>
        <p class="fine">
          В рейтинге участвуют только зарегистрированные читатели.
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(20, 14, 10, .7);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
  animation: fade-in .15s ease;
}

.card {
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: var(--radius-md);
  padding: 24px;
  width: 100%;
  max-width: 560px;
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  color: var(--parchment);
  animation: slide-up .2s ease;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 22px;
  flex: 1;
}

.close {
  background: none;
  border: none;
  color: var(--parchment);
  opacity: .5;
  font-size: 26px;
  line-height: 1;
  padding: 0 4px;
  cursor: pointer;
}

.close:hover { opacity: 1; }

.tabs {
  display: flex;
  gap: 8px;
  margin: 16px 0 4px;
}

.tab {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--parchment);
  background: rgba(241, 230, 210, .05);
  border: 1px solid rgba(241, 230, 210, .14);
  border-radius: var(--radius-sm);
  padding: 7px 14px;
  cursor: pointer;
}

.tab.active {
  background: var(--ember);
  border-color: var(--ember);
  color: var(--bg-dark);
}

.note {
  margin: 24px 0;
  font-size: 14px;
  opacity: .6;
  text-align: center;
}

.note.err { color: #e07070; opacity: 1; }

/* Таблица в своей рамке: так она читается блоком, а не текстом внавал. */
.table-wrap {
  flex: 0 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  margin-top: 14px;
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: var(--radius-sm);
  /* Тонкая полупрозрачная полоса вместо системной: та на тёмном фоне выглядит
     чужеродной серой плашкой. Так же сделан список подсказок в самой игре. */
  scrollbar-width: thin;
  scrollbar-color: rgba(241, 230, 210, .22) transparent;
}

.table-wrap::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.table-wrap::-webkit-scrollbar-track {
  background: transparent;
}

.table-wrap::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: rgba(241, 230, 210, .18);
}

.table-wrap::-webkit-scrollbar-thumb:hover {
  background: rgba(241, 230, 210, .32);
}

.table {
  width: 100%;
  /* Раскладка по заданным ширинам, а не по содержимому: иначе «Попыток» и
     «Серия» не сжимаются, сумма колонок перерастает окно и таблица едет вбок. */
  table-layout: fixed;
  /* separate, а не collapse: со схлопнутыми границами браузеры по-разному
     рисуют фон прилипшей шапки, и строки просвечивают сквозь неё. */
  border-collapse: separate;
  border-spacing: 0;
  font-size: 14px;
}

/* Приглушаем цветом, а не opacity: та гасит вместе с текстом и фон, и сквозь
   прилипшую шапку просвечивают уезжающие под неё строки. */
.table th {
  text-align: left;
  font-weight: 500;
  font-size: 12px;
  color: rgba(241, 230, 210, .5);
  padding: 8px 10px;
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-dark-2);
  box-shadow: inset 0 -1px rgba(241, 230, 210, .12);
}

.table td {
  padding: 8px 10px;
  border-top: 1px solid rgba(241, 230, 210, .08);
}

/* Линию под шапкой рисует сама шапка — своя граница первой строке не нужна,
   иначе между ними получается двойная черта. */
.table tbody tr:first-child td { border-top: none; }

/* Ширины колонок — на <col>: при фиксированной раскладке их берут все ячейки,
   и объединённый заголовок «Игрок» ничего не ломает. */
.c-place { width: 56px; }
/* Ширина <col> при table-layout: fixed и box-sizing: border-box считается
   вместе с полями ячейки. 26px на колонку не оставляли аватарке ничего: под
   картинку выходило 6px, она вылезала за ячейку и упиралась в имя вплотную.
   Держим поле слева плюс саму аватарку: 10 + 26. */
.c-avatar { width: 36px; }
.c-num { width: 66px; }

.col-place { color: rgba(241, 230, 210, .5); }

.place {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* Номер в колонке своей ширины и одинаковыми по ширине цифрами: иначе корона
   у первого места стоит левее, чем у десятого. */
.place-num {
  min-width: 18px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Корона у призёров: рисуем сами, а не эмодзи — цветная картинка из системного
   шрифта на тёмном фоне выглядит наклейкой. */
.crown {
  width: 14px;
  height: 11px;
  flex: 0 0 auto;
  fill: currentColor;
}

.crown.gold { color: #e0a53f; }
.crown.silver { color: #c6c1b6; }
.crown.bronze { color: #b57a45; }

/* Числовые колонки по центру: под своими заголовками они так и читаются.
   Заголовок пишем отдельным селектором с .table th: у общего .table th
   { text-align: left } вес выше, чем у одного класса, и голый .num его не
   перебивал — числа центрировались, а подписи над ними оставались слева. */
.table th.num,
.table td.num { text-align: center; white-space: nowrap; }
.of { opacity: .4; font-size: 12px; }

/* Своя строка обведена рамкой: в двадцати строках взгляд иначе её не найдёт. */
.me td {
  background: rgba(241, 230, 210, .05);
  border-top: 1px solid var(--ember-soft);
  border-bottom: 1px solid var(--ember-soft);
}

.me td:first-child { border-left: 1px solid var(--ember-soft); }
.me td:last-child { border-right: 1px solid var(--ember-soft); }

/* Строка, оторванная от таблицы: между нею и двадцаткой пропуск, и отступ
   сверху не даёт ей читаться двадцать первым местом. */
.apart td { padding-top: 18px; }

/* Зазор между аватаркой и именем. Селекторы с .table td обязательны: у .table td
   вес выше, чем у одного класса, и правило без него молча проигрывает общему
   padding — прежний .col-avatar { padding-right: 7px } так и не сработал ни разу. */
.table td.col-avatar { padding-right: 0; }
.table td.name { padding-left: 12px; }

/* Крайние колонки не липнут к рамке таблицы. */

.table th:first-child,
.table td:first-child { padding-left: 12px; }

.table th:last-child,
.table td:last-child { padding-right: 14px; }

.avatar {
  display: block;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(241, 230, 210, .08);
}

.avatar-letter {
  display: grid;
  place-items: center;
  font-size: 12px;
  opacity: .7;
}

/* При фиксированной раскладке колонка имени забирает весь остаток сама. */
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fine {
  margin: 14px 0 0;
  font-size: 11px;
  line-height: 1.5;
  opacity: .45;
}

.fine + .fine { margin-top: 6px; }

@keyframes fade-in {
  from { opacity: 0; }
}

@keyframes slide-up {
  from { transform: translateY(10px); opacity: 0; }
}

/* На телефоне окно занимает экран целиком: полей по краям там нет, а таблице
   нужна каждая точка ширины. Длинное имя обрезается многоточием. */
@media (max-width: 560px) {
  .backdrop { padding: 0; }

  .card {
    max-width: none;
    max-height: 100vh;
    height: 100%;
    border: none;
    border-radius: 0;
    padding: 16px 12px calc(16px + env(safe-area-inset-bottom));
  }

  .title { font-size: 19px; }
  .tab { padding: 7px 11px; font-size: 12px; }
  .table { font-size: 13px; }
  .table th, .table td { padding: 8px 6px; }
  .table th:first-child, .table td:first-child { padding-left: 9px; }
  .table th:last-child, .table td:last-child { padding-right: 10px; }

  /* Числовые колонки меряются не числом, а своим заголовком: «Попыток» длиннее
     всех и не переносится. В колонку он не влезал и уходил вправо — у средних
     колонок это съедало воздух соседей и оставалось видимым, а у крайней
     обрезалось рамкой таблицы: на вкладке «Свободная игра» последней стоит как
     раз «Попыток».
     Место берём шириной колонки, а не полями: отступ крайних колонок от рамки
     таблицы поставлен нарочно. Плюс заголовок на ступень мельче — для запаса. */
  .table th { font-size: 11px; }
  .c-num { width: 68px; }

  /* Колонка места должна вмещать своё содержимое целиком: номер (min-width 18px),
     зазор 6px и корону 14px — это 38px, плюс поля ячейки 9 и 6. Меньше 53px — и
     корона вылезает вправо, к аватарке. */
  .c-place { width: 53px; }
  .c-avatar { width: 32px; }

  .of { display: none; }
}
</style>
