<script setup lang="ts">
import type {
  DrawWord,
  Gender,
  TitleRarity,
  TreeMode,
  TreeTextKey,
  TreeWordKind,
} from "#shared/utils/tree";
import {
  GENDER_LABEL,
  RARITY_LABEL,
  TREE_MODES,
  TREE_TEXTS,
  agreeAdjective,
  drawTitle,
} from "#shared/utils/tree";

/**
 * Вкладка «Ёлка»: включить её (сначала — только для админов), шансы, тексты,
 * слова для титулов и что уже выпало. Неудачный титул отсюда можно убрать —
 * он пропадёт и с доски, и у того, кто его носит.
 */

type Word = DrawWord & { active: boolean };
type TitleRow = {
  id: number;
  text: string;
  rarity: TitleRarity;
  gifts: number;
  wonAt: string;
  trial: boolean;
  name: string;
  code: string | null;
};
type AdminTree = {
  settings: {
    mode: TreeMode;
    threeChance: number;
    rareChance: number;
    texts: Record<TreeTextKey, string>;
  };
  words: Word[];
  titles: TitleRow[];
  stats: { shakes: number; people: number; today: number };
};

const { data, refresh } = await useFetch<AdminTree>("/api/admin/tree");

// ── Настройки ─────────────────────────────────
const mode = ref<TreeMode>("off");
const threeChance = ref(40);
const rareChance = ref(3);
const texts = reactive<Record<TreeTextKey, string>>({ ...TREE_TEXTS });
const TEXT_FIELDS: { key: TreeTextKey; label: string; long?: boolean }[] = [
  { key: "tree_title", label: "Заголовок" },
  { key: "tree_text", label: "Текст баннера", long: true },
  { key: "tree_button", label: "Кнопка" },
  { key: "tree_board_title", label: "Заголовок доски" },
];

watch(
  () => data.value?.settings,
  (s) => {
    if (!s) return;
    mode.value = s.mode;
    threeChance.value = s.threeChance;
    rareChance.value = s.rareChance;
    Object.assign(texts, s.texts);
  },
  { immediate: true },
);

const saving = ref(false);
const saveMsg = ref("");
const saveError = ref("");

const saveSettings = async () => {
  saving.value = true;
  saveMsg.value = "";
  saveError.value = "";
  try {
    // Текст, совпадающий с тем, что по умолчанию, храним пустым: тогда новая
    // формулировка по умолчанию дойдёт и сюда.
    const body: Record<string, string> = {
      tree_mode: mode.value,
      tree_three_chance: String(threeChance.value),
      tree_rare_chance: String(rareChance.value),
    };
    for (const f of TEXT_FIELDS) {
      const v = texts[f.key].trim();
      body[f.key] = v === TREE_TEXTS[f.key] ? "" : v;
    }
    await $fetch("/api/admin/settings", { method: "PUT", body });
    await refresh();
    saveMsg.value = "Сохранено";
  } catch (e: any) {
    saveError.value = e.data?.message || "Не сохранилось";
  } finally {
    saving.value = false;
  }
};

const treeOpen = ref(false);

// ── Слова ─────────────────────────────────────
const KINDS: { kind: TreeWordKind; title: string; note: string }[] = [
  {
    kind: "adj",
    title: "Прилагательные",
    note: "В мужском роде. Женский и средний получаются сами — проверь их в строке под словом; не вышло — впиши руками.",
  },
  {
    kind: "noun",
    title: "Существительные",
    note: "С родом: по нему прилагательное и согласуется.",
  },
  {
    kind: "tail",
    title: "Хвостики",
    note: "Третий подарок. Не склоняются, поэтому подходят к любой паре.",
  },
];

const words = computed(() => data.value?.words ?? []);
const wordsOf = (kind: TreeWordKind) =>
  words.value.filter((w) => w.kind === kind);

const wordError = ref("");
const busyWord = ref<number | null>(null);

const updateWord = async (w: Word, patch: Record<string, unknown>) => {
  busyWord.value = w.id;
  wordError.value = "";
  try {
    await $fetch(`/api/admin/tree/words/${w.id}`, {
      method: "PUT",
      body: patch,
    });
    await refresh();
  } catch (e: any) {
    wordError.value = e.data?.message || "Не сохранилось";
    await refresh();
  } finally {
    busyWord.value = null;
  }
};

const removeWord = async (w: Word) => {
  if (!confirm(`Удалить «${w.word}»? Уже выпавшие титулы останутся как были.`))
    return;
  busyWord.value = w.id;
  try {
    await $fetch(`/api/admin/tree/words/${w.id}`, { method: "DELETE" });
    await refresh();
  } catch (e: any) {
    wordError.value = e.data?.message || "Не удалилось";
  } finally {
    busyWord.value = null;
  }
};

const fresh = reactive<Record<TreeWordKind, string>>({
  adj: "",
  noun: "",
  tail: "",
});
const freshGender = ref<Gender>("m");

const addWord = async (kind: TreeWordKind) => {
  const word = fresh[kind].trim();
  if (!word) return;
  wordError.value = "";
  try {
    await $fetch("/api/admin/tree/words", {
      method: "POST",
      body: {
        kind,
        word,
        ...(kind === "noun" ? { gender: freshGender.value } : {}),
      },
    });
    fresh[kind] = "";
    await refresh();
  } catch (e: any) {
    wordError.value = e.data?.message || "Не добавилось";
  }
};

// Свои формы рода у прилагательного — раскрываются по кнопке.
const formsOpen = ref(new Set<number>());
const toggleForms = (id: number) => {
  const next = new Set(formsOpen.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  formsOpen.value = next;
};
const formF = (w: Word) => w.wordF || agreeAdjective(w.word, "f");
const formN = (w: Word) => w.wordN || agreeAdjective(w.word, "n");

// ── Примеры ───────────────────────────────────
// Тот же жребий, что на сервере, но здесь, из текущих слов: послушать, как
// звучат сочетания, не тряся ёлку. Ничего не записывается.
const samples = ref<{ text: string; rarity: TitleRarity }[]>([]);
const makeSamples = () => {
  const pool = words.value.filter((w) => w.active);
  const rand = (n: number) => Math.floor(Math.random() * n);
  samples.value = Array.from({ length: 8 }, () =>
    drawTitle(pool, threeChance.value, rareChance.value, rand),
  ).flatMap((d) => (d ? [{ text: d.text, rarity: d.rarity }] : []));
};

// ── Выпавшие титулы ───────────────────────────
const titles = computed(() => data.value?.titles ?? []);
const titleError = ref("");

const removeTitle = async (t: TitleRow) => {
  if (
    !confirm(
      `Убрать «${t.text}» у ${t.name}? Титул пропадёт из коллекции, с доски и у имени.`,
    )
  )
    return;
  titleError.value = "";
  try {
    await $fetch(`/api/admin/tree/titles/${t.id}`, { method: "DELETE" });
    await refresh();
  } catch (e: any) {
    titleError.value = e.data?.message || "Не убрался";
  }
};

const when = (raw: string) =>
  new Date(raw.replace(" ", "T") + "Z").toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
</script>

<template>
  <section class="card card--panel card--wide">
    <h2>Новогодняя ёлка</h2>

    <p class="tree-note">
      Ёлку трясут на главной: выпадают два или три подарка, из слов в них
      складывается титул. Он сразу встаёт у имени и держится до полуночи по
      Москве, потом его можно снять или сменить на любой из коллекции. Трясти —
      раз в день; админ трясёт без ограничений.
    </p>

    <p v-if="data" class="tree-stats">
      Трясли <b>{{ data.stats.shakes }}</b> раз, людей —
      <b>{{ data.stats.people }}</b
      >, сегодня — <b>{{ data.stats.today }}</b
      >.
    </p>

    <!-- Настройки -->
    <div class="field-row">
      <label for="tree-mode">Ёлка</label>
      <select id="tree-mode" v-model="mode">
        <option v-for="m in TREE_MODES" :key="m.value" :value="m.value">
          {{ m.label }}
        </option>
      </select>
    </div>

    <div class="chance-row">
      <div class="field-row">
        <label for="tree-three">Третий подарок, %</label>
        <input
          id="tree-three"
          v-model.number="threeChance"
          type="number"
          min="0"
          max="100"
        />
      </div>
      <div class="field-row">
        <label for="tree-rare">Золотое слово, %</label>
        <input
          id="tree-rare"
          v-model.number="rareChance"
          type="number"
          min="0"
          max="100"
        />
      </div>
    </div>

    <div v-for="f in TEXT_FIELDS" :key="f.key" class="field-row">
      <label :for="`tree-${f.key}`">{{ f.label }}</label>
      <textarea
        v-if="f.long"
        :id="`tree-${f.key}`"
        v-model="texts[f.key]"
        rows="2"
        maxlength="300"
      />
      <input
        v-else
        :id="`tree-${f.key}`"
        v-model="texts[f.key]"
        type="text"
        maxlength="80"
      />
    </div>

    <div class="save-row">
      <button
        class="btn btn--primary"
        type="button"
        :disabled="saving"
        @click="saveSettings"
      >
        {{ saving ? "Сохраняем…" : "Сохранить" }}
      </button>
      <button
        v-if="data?.settings.mode !== 'off'"
        class="btn btn--ghost"
        type="button"
        @click="treeOpen = true"
      >
        Открыть ёлку
      </button>
    </div>
    <p v-if="saveMsg" class="result-msg">{{ saveMsg }}</p>
    <p v-if="saveError" class="err-msg">{{ saveError }}</p>

    <TreeModal v-if="treeOpen" @close="treeOpen = false" @shaken="refresh()" />

    <hr class="section-divider" />

    <!-- Примеры -->
    <h3 class="tree-sub">Как звучит</h3>
    <p class="tree-note">
      Случайные титулы из нынешних слов и шансов — послушать сочетания. Ничего
      не записывается.
    </p>
    <button class="btn btn--ghost btn--sm" type="button" @click="makeSamples">
      {{ samples.length ? "Ещё примеры" : "Показать примеры" }}
    </button>
    <ul v-if="samples.length" class="sample-list">
      <li v-for="(s, i) in samples" :key="i">
        <NameTitle :title="{ id: i, text: s.text, rarity: s.rarity }" />
      </li>
    </ul>

    <hr class="section-divider" />

    <!-- Слова -->
    <p v-if="wordError" class="err-msg">{{ wordError }}</p>
    <div v-for="k in KINDS" :key="k.kind" class="kind">
      <h3 class="tree-sub">
        {{ k.title }}
        <span class="count">{{ wordsOf(k.kind).length }}</span>
      </h3>
      <p class="tree-note">{{ k.note }}</p>

      <form class="add-row" @submit.prevent="addWord(k.kind)">
        <input
          v-model="fresh[k.kind]"
          type="text"
          maxlength="40"
          :placeholder="
            k.kind === 'adj'
              ? 'Ворчливый'
              : k.kind === 'noun'
                ? 'Табурет'
                : 'из Лискора'
          "
          :aria-label="`Новое слово: ${k.title.toLowerCase()}`"
        />
        <select v-if="k.kind === 'noun'" v-model="freshGender" aria-label="Род">
          <option v-for="(label, g) in GENDER_LABEL" :key="g" :value="g">
            {{ label }}
          </option>
        </select>
        <button class="btn btn--sm btn--primary" type="submit">Добавить</button>
      </form>

      <ul class="word-list">
        <li
          v-for="w in wordsOf(k.kind)"
          :key="w.id"
          class="word-row"
          :class="{ off: !w.active, gold: w.rare }"
        >
          <div class="word-line">
            <input
              class="word-input"
              type="text"
              maxlength="40"
              :value="w.word"
              :disabled="busyWord === w.id"
              :aria-label="`Слово «${w.word}»`"
              @change="
                updateWord(w, {
                  word: ($event.target as HTMLInputElement).value,
                })
              "
            />
            <select
              v-if="k.kind === 'noun'"
              :value="w.gender"
              aria-label="Род"
              @change="
                updateWord(w, {
                  gender: ($event.target as HTMLSelectElement).value,
                })
              "
            >
              <option v-for="(label, g) in GENDER_LABEL" :key="g" :value="g">
                {{ label }}
              </option>
            </select>
            <label class="tick" title="Выпадает редко и делает титул редким">
              <input
                type="checkbox"
                :checked="w.rare"
                @change="
                  updateWord(w, {
                    rare: ($event.target as HTMLInputElement).checked,
                  })
                "
              />
              золотое
            </label>
            <label class="tick" title="Снятое с раздачи больше не выпадает">
              <input
                type="checkbox"
                :checked="w.active"
                @change="
                  updateWord(w, {
                    active: ($event.target as HTMLInputElement).checked,
                  })
                "
              />
              в раздаче
            </label>
            <button
              class="word-del"
              type="button"
              :aria-label="`Удалить «${w.word}»`"
              @click="removeWord(w)"
            >
              ×
            </button>
          </div>

          <div v-if="k.kind === 'adj'" class="forms">
            <span>она: {{ formF(w) }} · оно: {{ formN(w) }}</span>
            <button
              class="forms-toggle"
              type="button"
              @click="toggleForms(w.id)"
            >
              {{ formsOpen.has(w.id) ? "свернуть" : "поправить" }}
            </button>
          </div>
          <div
            v-if="k.kind === 'adj' && formsOpen.has(w.id)"
            class="forms-edit"
          >
            <input
              type="text"
              maxlength="40"
              :value="w.wordF ?? ''"
              :placeholder="agreeAdjective(w.word, 'f')"
              aria-label="Женский род"
              @change="
                updateWord(w, {
                  wordF: ($event.target as HTMLInputElement).value,
                })
              "
            />
            <input
              type="text"
              maxlength="40"
              :value="w.wordN ?? ''"
              :placeholder="agreeAdjective(w.word, 'n')"
              aria-label="Средний род"
              @change="
                updateWord(w, {
                  wordN: ($event.target as HTMLInputElement).value,
                })
              "
            />
          </div>
        </li>
      </ul>
    </div>

    <hr class="section-divider" />

    <!-- Выпавшие -->
    <h3 class="tree-sub">Последние титулы</h3>
    <p v-if="!titles.length" class="empty-hint">Ещё никто не тряс.</p>
    <p v-if="titleError" class="err-msg">{{ titleError }}</p>
    <ul v-if="titles.length" class="title-list">
      <li v-for="t in titles" :key="t.id" class="title-row">
        <span class="title-who">
          <NuxtLink v-if="t.code" :to="`/reader/${t.code}`">{{
            t.name
          }}</NuxtLink>
          <template v-else>{{ t.name }}</template>
        </span>
        <NameTitle :title="t" />
        <span class="title-meta">
          {{ RARITY_LABEL[t.rarity] }} · {{ when(t.wonAt) }}
          <span v-if="t.trial" class="trial">проба</span>
        </span>
        <button class="word-del" type="button" @click="removeTitle(t)">
          Убрать
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped src="../assets/css/admin-panel.css"></style>

<style scoped>
.tree-note {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-muted);
}

.tree-stats {
  margin: 0 0 18px;
  font-size: 13px;
  color: var(--parchment-2);
}

.chance-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.save-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.err-msg {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--danger);
}

.tree-sub {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--parchment-2);
}

.count {
  margin-left: 6px;
  font-weight: 400;
  font-size: 12px;
  opacity: 0.5;
}

.sample-list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 15px;
}

.kind + .kind {
  margin-top: 26px;
}

.add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.add-row input,
.add-row select,
.word-line input[type="text"],
.word-line select,
.forms-edit input {
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--fill);
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 13px;
}

.add-row input {
  flex: 1;
}

.word-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.word-row {
  padding: 6px 8px;
  border-radius: var(--radius-md);
  background: var(--fill-faint);
}

.word-row.gold {
  background: rgba(233, 199, 102, 0.07);
  box-shadow: inset 2px 0 0 rgba(233, 199, 102, 0.6);
}

.word-row.off {
  opacity: 0.5;
}

.word-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
}

.word-input {
  flex: 1 1 180px;
}

.tick {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--parchment-2);
  cursor: pointer;
}

.word-del {
  margin-left: auto;
  padding: 2px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
}

.word-del:hover {
  color: var(--danger);
  background: var(--fill-strong);
}

.forms {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.forms-toggle {
  padding: 0;
  border: none;
  background: none;
  color: var(--ember-soft);
  font-size: 12px;
  cursor: pointer;
}

.forms-edit {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.forms-edit input {
  flex: 1;
}

.title-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
  padding: 6px 8px;
  border-radius: var(--radius-md);
  background: var(--fill-faint);
  font-size: 14px;
}

.title-who {
  font-weight: 600;
}

.title-who a {
  color: var(--parchment);
}

.title-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.trial {
  margin-left: 4px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  background: var(--gold);
  color: var(--bg-dark);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

@media (max-width: 520px) {
  .chance-row {
    grid-template-columns: 1fr;
  }
}
</style>
