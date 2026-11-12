<script setup lang="ts">
/** Вкладка «Настройки сайта»: тексты, ссылки, игра, трекер. */
const { data: settings, refresh: refreshSettings } = useFetch("/api/settings");

// --- Настройки сайта ---
const form = reactive({
  hero_title: "",
  hero_subtitle: "",
  hero_ticker: "",
  hero_ticker_on: "",
  ledger_note: "",
  footer_text: "",
  telegram_url: "",
  boosty_url: "",
  tribute_url: "",
  about_title: "",
  about_text: "",
  error_404_sub: "",
  update_schedule: "",
  original_chapters_total: "",
  original_words_ratio: "",
  game_max_volume: "",
  game_cta_title: "",
  game_cta_text: "",
  tg_cta_title: "",
  tg_cta_text: "",
  characters_title: "",
  characters_subtitle: "",
  season: "",
});
watch(
  settings,
  (s) => {
    if (s) Object.assign(form, s, { season: seasonOf(s) });
  },
  { immediate: true },
);

/*
  Настройки хранятся строками, а галочке нужно логическое значение — отсюда
  посредник. Пустая настройка считается включённой: если строка уже написана, а
  флажка в базе ещё нет, показать её правильнее, чем спрятать.
*/
const tickerOn = computed({
  get: () => form.hero_ticker_on !== "0",
  set: (v: boolean) => {
    form.hero_ticker_on = v ? "1" : "0";
  },
});

const savingSettings = ref(false);
const settingsSaved = ref(false);

const saveSettings = async () => {
  savingSettings.value = true;
  try {
    await $fetch("/api/admin/settings", { method: "PUT", body: form });
    settingsSaved.value = true;
    setTimeout(() => {
      settingsSaved.value = false;
    }, 2000);
    await refreshSettings();
  } finally {
    savingSettings.value = false;
  }
};
</script>

<template>
  <section class="card card--panel">
    <h2>Настройки сайта</h2>
    <div class="field-row">
      <label>Оформление</label>
      <select v-model="form.season">
        <option v-for="s in SEASONS" :key="s.value" :value="s.value">
          {{ s.label }}
        </option>
      </select>
      <span class="field-hint">
        Осень — листья в углах плашек и на фоне главы. Зима — сосульки и
        снегопад на картинке главной, снег на её нижнем краю, на вывеске и на
        плашках, снежинки на фоне главы.
      </span>
    </div>
    <div class="field-row">
      <label>Заголовок hero</label>
      <input v-model="form.hero_title" type="text" />
    </div>
    <div class="field-row">
      <label>Подзаголовок hero</label>
      <textarea v-model="form.hero_subtitle" rows="3" />
    </div>
    <div class="field-row">
      <label>Бегущая строка под hero</label>
      <textarea
        v-model="form.hero_ticker"
        rows="4"
        placeholder="Каждая строка — отдельная фраза"
      />
      <span class="field-hint">
        По фразе на строку — на сайте они пойдут в ряд через точку и будут
        повторяться по кругу. Скорость подбирается сама по длине текста. Строку
        видят только незарегистрированные читатели, клик по ней ведёт на вход.
      </span>
    </div>
    <label class="checkbox-row">
      <input v-model="tickerOn" type="checkbox" />
      <span
        >Показывать бегущую строку (галочку можно снять, текст сохранится)</span
      >
    </label>
    <div class="field-row">
      <label>Текст под оглавлением</label>
      <input v-model="form.ledger_note" type="text" />
    </div>
    <div class="field-row">
      <label>Текст футера</label>
      <textarea v-model="form.footer_text" rows="3" />
    </div>
    <div class="field-row">
      <label>Страница «О проекте» — заголовок</label>
      <input v-model="form.about_title" type="text" placeholder="О проекте" />
    </div>
    <div class="field-row">
      <label>Страница «О проекте» — текст</label>
      <textarea
        v-model="form.about_text"
        rows="8"
        placeholder="Расскажите о проекте, переводчиках, истории..."
      />
    </div>
    <div class="field-row">
      <label>Ссылка Telegram</label>
      <input v-model="form.telegram_url" type="url" />
    </div>
    <div class="field-row">
      <label>Блок про телеграм — заголовок</label>
      <input
        v-model="form.tg_cta_title"
        type="text"
        placeholder="Не пропусти новую главу"
      />
    </div>
    <div class="field-row">
      <label>Блок про телеграм — текст</label>
      <textarea
        v-model="form.tg_cta_text"
        rows="2"
        placeholder="Бот в телеграм-канале присылает уведомление о каждой новой главе сразу после публикации."
      />
    </div>
    <div class="field-row">
      <label>Ссылка Boosty</label>
      <input
        v-model="form.boosty_url"
        type="url"
        placeholder="https://boosty.to/..."
      />
    </div>
    <div class="field-row">
      <label>Ссылка Tribute</label>
      <input
        v-model="form.tribute_url"
        type="url"
        placeholder="https://tribute.tg/..."
      />
    </div>
    <div class="field-row">
      <label>Текст страницы 404</label>
      <input
        v-model="form.error_404_sub"
        type="text"
        placeholder="Козёл добрался до этой страницы раньше тебя."
      />
    </div>
    <div class="field-row">
      <label>Глав в неделю</label>
      <input v-model="form.update_schedule" type="text" placeholder="2–3" />
    </div>
    <div class="field-row">
      <label>Глав в оригинале</label>
      <input
        v-model="form.original_chapters_total"
        type="number"
        min="1"
        :placeholder="settings?.original_chapters_auto || 'узнаём сами'"
      />
      <span class="field-hint">
        Для трекера прогресса. Оставь пустым — число раз в сутки подтягивается
        из InnWords само{{
          settings?.original_chapters_auto
            ? ` (сейчас ${settings.original_chapters_auto})`
            : ""
        }}. Ставь своё, только если автоматика врёт или отвалилась.
      </span>
    </div>
    <div class="field-row">
      <label>Слов на одно английское</label>
      <input
        v-model="form.original_words_ratio"
        type="number"
        min="0.1"
        max="3"
        step="0.001"
        placeholder="0.824"
      />
      <span class="field-hint">
        Сколько русских слов выходит из одного английского — так трекер
        переводит объём оригинала{{
          settings?.original_words_auto
            ? ` (${Number(settings.original_words_auto).toLocaleString("ru-RU")} слов)`
            : ""
        }}
        в наши слова. Пусто — 0,824.
      </span>
    </div>
    <div class="field-row">
      <label>Игра: до какого тома</label>
      <input
        v-model="form.game_max_volume"
        type="number"
        min="1"
        max="10"
        placeholder="пусто — по переводу"
      />
      <span class="field-hint">
        Оставь пустым — потолок держится за границу перевода сам: новый том
        открывается, когда в нём опубликовано 35 глав, до этого игра стоит на
        предыдущем. Число ставь, только если нужно открыть игру шире или,
        наоборот, придержать. Персонаж дня берётся из тех, кто появился до этого
        тома, спойлерные признаки скрываются; в свободной игре том выбирает сам
        игрок.
      </span>
    </div>
    <div class="field-row">
      <label>Игра: заголовок баннера</label>
      <input
        v-model="form.game_cta_title"
        type="text"
        placeholder="Кто из таверны?"
      />
    </div>
    <div class="field-row">
      <label>Игра: текст баннера</label>
      <textarea v-model="form.game_cta_text" rows="3" />
      <span class="field-hint">
        Плашка на главной, перед оглавлением. Вместо
        <b>{том}</b> подставится номер из поля выше — так обещание «без
        спойлеров» не устареет, когда перевод уйдёт дальше.
      </span>
    </div>
    <div class="field-row">
      <label>Персонажи: заголовок</label>
      <input
        v-model="form.characters_title"
        type="text"
        placeholder="Кто живёт в таверне"
      />
    </div>
    <div class="field-row">
      <label>Персонажи: подзаголовок</label>
      <textarea v-model="form.characters_subtitle" rows="2" />
      <span class="field-hint"
        >Страница карточек персонажей, под заголовком.</span
      >
    </div>
    <button
      class="btn btn--primary"
      :disabled="savingSettings"
      @click="saveSettings"
    >
      {{
        settingsSaved
          ? "✓ Сохранено"
          : savingSettings
            ? "Сохраняем..."
            : "Сохранить"
      }}
    </button>
  </section>
</template>

<style scoped src="../assets/css/admin-panel.css"></style>

<style scoped>
.field-row textarea {
  resize: vertical;
}

/* Пояснение под полем настройки — там, где одного названия мало. */
.field-hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink-soft);
  opacity: 0.8;
}
</style>
