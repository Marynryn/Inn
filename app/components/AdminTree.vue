<script setup lang="ts">
import type {
  DrawWord,
  Gender,
  NameTitle,
  TierMark,
  TreeMode,
  TreeTextKey,
  TreeTier,
  TreeWordKind,
} from "#shared/utils/tree";
import {
  GENDER_LABEL,
  TREE_MODES,
  TREE_TEXTS,
  agreeAdjective,
  drawTitle,
  isMultiWord,
  tierLabel,
  tierMark,
  tierOfWord,
} from "#shared/utils/tree";

/**
 * Вкладка «Ёлка»: включить её (сначала — только для админов), шансы, тексты,
 * редкости слов, сами слова и что уже выпало. Неудачный титул отсюда можно убрать —
 * он пропадёт и с доски, и у того, кто его носит.
 */

type Word = DrawWord & { active: boolean };
type TitleRow = {
  id: number;
  text: string;
  tier: TierMark | null;
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
    texts: Record<TreeTextKey, string>;
  };
  tiers: TreeTier[];
  words: Word[];
  titles: TitleRow[];
  stats: { shakes: number; people: number; today: number };
};

const { data, refresh } = await useFetch<AdminTree>("/api/admin/tree");

// ── Настройки ─────────────────────────────────
const mode = ref<TreeMode>("off");
const threeChance = ref(40);
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

// ── Редкости ──────────────────────────────────
// Свои у ивента: название, цвет, шанс на титул. Чем шанс меньше, тем
// редкость сильнее — её цвет у скобок титула. Сумма шансов — сколько
// процентов титулов вообще получат особое слово.
const tiers = computed(() => data.value?.tiers ?? []);
const tierById = computed(() => new Map(tiers.value.map((t) => [t.id, t])));
const tierSum = computed(
  () => Math.round(tiers.value.reduce((n, t) => n + t.chance, 0) * 100) / 100,
);
const tierError = ref("");
const busyTier = ref<number | null>(null);

const updateTier = async (t: TreeTier, patch: Record<string, unknown>) => {
  busyTier.value = t.id;
  tierError.value = "";
  try {
    await $fetch(`/api/admin/tree/tiers/${t.id}`, {
      method: "PUT",
      body: patch,
    });
    await refresh();
  } catch (e: any) {
    tierError.value = e.data?.message || "Не сохранилось";
    await refresh();
  } finally {
    busyTier.value = null;
  }
};

const removeTier = async (t: TreeTier) => {
  if (
    !confirm(
      `Удалить редкость «${t.name}»? Её слова станут обычными, выпавшие с ней титулы — без цвета.`,
    )
  )
    return;
  busyTier.value = t.id;
  try {
    await $fetch(`/api/admin/tree/tiers/${t.id}`, { method: "DELETE" });
    await refresh();
  } catch (e: any) {
    tierError.value = e.data?.message || "Не удалилось";
  } finally {
    busyTier.value = null;
  }
};

const freshTier = reactive({ name: "", color: "#8e44ad", chance: 1 });
const addTier = async () => {
  if (!freshTier.name.trim()) return;
  tierError.value = "";
  try {
    await $fetch("/api/admin/tree/tiers", {
      method: "POST",
      body: { ...freshTier, glow: true },
    });
    freshTier.name = "";
    await refresh();
  } catch (e: any) {
    tierError.value = e.data?.message || "Не добавилась";
  }
};

/** Полоска у слова — цвет его редкости, у составного без своей — голубая. */
const wordTone = (w: Word) => {
  const t = tierOfWord(w, tierById.value);
  return t ? { "--tier": t.color } : undefined;
};

/** Пример слова этой редкости — как оно будет выглядеть в титуле. */
const tierSample = (t: TreeTier): NameTitle => ({
  id: -t.id,
  text: t.name,
  tier: tierMark(t),
  parts: [{ text: t.name, tier: tierMark(t) }],
});

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
const samples = ref<NameTitle[]>([]);
const makeSamples = () => {
  const pool = words.value.filter((w) => w.active);
  const rand = (n: number) => Math.floor(Math.random() * n);
  samples.value = Array.from({ length: 8 }, () =>
    drawTitle(pool, tiers.value, threeChance.value, rand),
  ).flatMap((d, i) =>
    d
      ? [
          {
            id: i,
            text: d.text,
            tier: tierMark(d.tier),
            parts: d.gifts.map((g) => ({ text: g.word, tier: g.tier })),
          },
        ]
      : [],
  );
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
      складывается титул. Его берут целиком, ставят одно его слово в свой титул
      или оставляют свой; взятый держится до полуночи по Москве, а снятый
      пропадает. Трясти — раз в день; админ трясёт без счёта. «Ивент закончен»
      прячет ёлку, а надетые титулы оставляет у имён.
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

    <!-- Редкости -->
    <h3 class="tree-sub">Редкости слов</h3>
    <p class="tree-note">
      Шанс — сколько процентов титулов получат слово этой редкости; чем он
      меньше, тем редкость сильнее, и её цвет — у скобок титула. Слова
      отмечаются ниже. «Свечение» — ореол вокруг слова, для тёмных цветов.
      Голубое «Необычное» заводить не нужно: им само становится слово из двух
      слов и больше (предлоги не в счёт) — «Почти Героический», «после третьей
      кружки»; своя редкость у слова важнее. Сейчас особое слово будет у
      <b>{{ tierSum }}%</b> титулов.
    </p>
    <p v-if="tierSum > 100" class="err-msg">
      Шансы в сумме больше 100% — самые частые редкости выпадать не будут.
    </p>
    <p v-if="tierError" class="err-msg">{{ tierError }}</p>
    <ul class="tier-list">
      <li v-for="t in tiers" :key="t.id" class="tier-row">
        <input
          class="tier-color"
          type="color"
          :value="t.color"
          :disabled="busyTier === t.id"
          :aria-label="`Цвет «${t.name}»`"
          @change="
            updateTier(t, { color: ($event.target as HTMLInputElement).value })
          "
        />
        <input
          class="tier-name"
          type="text"
          maxlength="30"
          :value="t.name"
          :disabled="busyTier === t.id"
          aria-label="Название"
          @change="
            updateTier(t, { name: ($event.target as HTMLInputElement).value })
          "
        />
        <label class="tier-chance">
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            :value="t.chance"
            :disabled="busyTier === t.id"
            :aria-label="`Шанс «${t.name}», %`"
            @change="
              updateTier(t, {
                chance: ($event.target as HTMLInputElement).value,
              })
            "
          />%
        </label>
        <label class="tick" title="Титулы с такими словами — сверху доски">
          <input
            type="checkbox"
            :checked="t.pinned"
            @change="
              updateTier(t, {
                pinned: ($event.target as HTMLInputElement).checked,
              })
            "
          />
          сверху доски
        </label>
        <label class="tick" title="Ореол вокруг слова — для тёмных цветов">
          <input
            type="checkbox"
            :checked="t.glow"
            @change="
              updateTier(t, {
                glow: ($event.target as HTMLInputElement).checked,
              })
            "
          />
          свечение
        </label>
        <span class="tier-sample"><NameTitle :title="tierSample(t)" /></span>
        <button
          class="word-del"
          type="button"
          :aria-label="`Удалить редкость «${t.name}»`"
          @click="removeTier(t)"
        >
          ×
        </button>
      </li>
    </ul>
    <form class="add-row" @submit.prevent="addTier">
      <input
        v-model="freshTier.color"
        class="tier-color"
        type="color"
        aria-label="Цвет новой редкости"
      />
      <input
        v-model="freshTier.name"
        type="text"
        maxlength="30"
        placeholder="Эпическое"
        aria-label="Название новой редкости"
      />
      <label class="tier-chance">
        <input
          v-model.number="freshTier.chance"
          type="number"
          min="0"
          max="100"
          step="0.1"
          aria-label="Шанс новой редкости, %"
        />%
      </label>
      <button class="btn btn--sm btn--primary" type="submit">Добавить</button>
    </form>

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
        <NameTitle :title="s" />
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
          :class="{ off: !w.active }"
          :style="wordTone(w)"
          :title="
            !w.tierId && isMultiWord(w.word)
              ? 'Из двух слов и больше — само выпадает необычным (голубым)'
              : undefined
          "
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
            <select
              class="word-tier"
              :value="w.tierId ?? ''"
              aria-label="Редкость"
              @change="
                updateWord(w, {
                  tierId: ($event.target as HTMLSelectElement).value || null,
                })
              "
            >
              <option value="">обычное</option>
              <option v-for="t in tiers" :key="t.id" :value="t.id">
                {{ t.name.toLowerCase() }}
              </option>
            </select>
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
          {{ tierLabel(t.tier) }} · {{ when(t.wonAt) }}
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
.forms-edit input,
.tier-row input[type="text"],
.tier-row input[type="number"] {
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

.add-row .tier-color,
.add-row .tier-chance input {
  flex: none;
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

/* Слово с редкостью — полоска и лёгкий фон её цвета (--tier). */
.word-row[style*="--tier"] {
  background: color-mix(in srgb, var(--tier) 8%, transparent);
  box-shadow: inset 2px 0 0 var(--tier);
}

.word-tier {
  max-width: 130px;
}

/* ── Редкости ─────────────────────────────── */
.tier-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
}

.tier-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 6px 8px;
  border-radius: var(--radius-md);
  background: var(--fill-faint);
}

.tier-color {
  flex: none;
  width: 34px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm, 4px);
  background: none;
  cursor: pointer;
}

.tier-name {
  width: 150px;
}

.tier-chance {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-muted);
}

.tier-chance input {
  width: 72px;
}

.tier-sample {
  font-size: 15px;
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
