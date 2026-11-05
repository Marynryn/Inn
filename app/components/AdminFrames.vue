<script setup lang="ts">
/** Вкладка «Рамки»: каталог рамок для аватарок и их выдача. */
import {
  FRAME_FIT_DEFAULT,
  FRAME_FIT_MAX,
  FRAME_FIT_MIN,
} from "#shared/utils/avatarFrames";

// --- Рамки для аватарок ---
type AdminFrame = {
  id: number;
  name: string;
  url: string;
  fit: number;
  inPool: boolean;
  isDefault: boolean;
  owners: number;
};
type FrameOwner = {
  id: number;
  name: string;
  avatarUrl: string | null;
  wearing: number | null;
  frames: { id: number; grantedAt: string }[];
};

// Примерка рамок — на своей аватарке. Профиль тот же запрос, что во вкладке
// «Аккаунт», — ключ общий, второй раз он не грузится.
const { data: profile } = useFetch("/api/admin/profile");
const currentAvatar = computed(() => profile.value?.avatarUrl ?? null);
const displayName = computed(() => profile.value?.displayName ?? "");

/** Сторона картинки рамки. Вчетверо крупнее аватарки: у рамки мелкие детали по
 *  кругу, и на 256 пикселях от них остаётся каша. */
const FRAME_SIDE = 512;

const { data: framesData, refresh: refreshFrames } = useFetch<{
  frames: AdminFrame[];
  owners: FrameOwner[];
}>("/api/admin/frames");

const frames = computed(() => framesData.value?.frames ?? []);
const frameOwners = computed(() => framesData.value?.owners ?? []);
const frameName = (id: number | null) =>
  frames.value.find((f) => f.id === id)?.name ?? "—";

const newFrame = reactive({ name: "", fit: FRAME_FIT_DEFAULT });
const newFrameFile = ref<File | null>(null);
const newFramePreview = ref<string | null>(null);
const frameFileInput = ref<HTMLInputElement | null>(null);
const savingFrame = ref(false);
const frameMsg = ref("");
const frameError = ref("");

const onFrameFile = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null;
  newFrameFile.value = file;
  newFramePreview.value = file ? URL.createObjectURL(file) : null;
};

/**
 * Ужимает картинку рамки до 512×512 прямо в браузере — на сервере нативной
 * библиотеки для этого нет. webp выбран ради прозрачности: без неё рамка была
 * бы квадратом, накрывающим аватарку. Картинку вписываем целиком, не обрезая:
 * у рамки края — это и есть рамка.
 */
const toFrameImage = (file: File): Promise<Blob> =>
  new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = FRAME_SIDE;
      canvas.height = FRAME_SIDE;

      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);

      const scale = FRAME_SIDE / Math.max(img.width, img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (FRAME_SIDE - w) / 2, (FRAME_SIDE - h) / 2, w, h);
      canvas.toBlob((blob) => resolve(blob ?? file), "image/webp", 0.9);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });

const createFrame = async () => {
  frameError.value = "";
  frameMsg.value = "";

  if (!newFrame.name.trim()) {
    frameError.value = "Нужно название";
    return;
  }
  if (!newFrameFile.value) {
    frameError.value = "Нужна картинка";
    return;
  }

  savingFrame.value = true;
  try {
    const fd = new FormData();
    fd.append("name", newFrame.name.trim());
    fd.append("fit", String(newFrame.fit));
    fd.append("image", await toFrameImage(newFrameFile.value), "frame.webp");

    await $fetch("/api/admin/frames", { method: "POST", body: fd });

    newFrame.name = "";
    newFrame.fit = FRAME_FIT_DEFAULT;
    newFrameFile.value = null;
    newFramePreview.value = null;
    if (frameFileInput.value) frameFileInput.value.value = "";
    frameMsg.value = "Рамка добавлена";
    await refreshFrames();
  } catch (e: any) {
    frameError.value = e?.data?.message || "Не сохранилось";
  } finally {
    savingFrame.value = false;
  }
};

const defaultFrame = computed(
  () => frames.value.find((f) => f.isDefault) ?? null,
);
const backfilling = ref(false);

/** Раздать рамку новичка тем, кто зарегистрировался до её появления. */
const backfillDefault = async () => {
  if (
    !confirm(
      "Выдать рамку новичка всем, кто уже зарегистрирован? Надета она будет только на тех, кто ходит без рамки.",
    )
  )
    return;

  backfilling.value = true;
  frameMsg.value = "";
  try {
    const res = await $fetch<{ message: string }>(
      "/api/admin/frames/backfill",
      { method: "POST" },
    );
    frameMsg.value = res.message;
    await refreshFrames();
  } catch (e: any) {
    frameError.value = e?.data?.message || "Не вышло";
  } finally {
    backfilling.value = false;
  }
};

const saveFrame = async (
  frame: AdminFrame,
  patch: { name?: string; fit?: number; inPool?: boolean; isDefault?: boolean },
) => {
  frameError.value = "";
  const fd = new FormData();
  if (patch.name !== undefined) fd.append("name", patch.name);
  if (patch.fit !== undefined) fd.append("fit", String(patch.fit));
  if (patch.inPool !== undefined) fd.append("inPool", patch.inPool ? "1" : "0");
  if (patch.isDefault !== undefined)
    fd.append("isDefault", patch.isDefault ? "1" : "0");

  try {
    await $fetch(`/api/admin/frames/${frame.id}`, { method: "PUT", body: fd });
    await refreshFrames();
  } catch (e: any) {
    frameError.value = e?.data?.message || "Не сохранилось";
  }
};

const removeFrame = async (frame: AdminFrame) => {
  const owned = frame.owners
    ? ` Её потеряют ${frame.owners} чел. — это отменит их награду.`
    : "";
  if (!confirm(`Удалить рамку «${frame.name}»?${owned}`)) return;

  try {
    await $fetch(`/api/admin/frames/${frame.id}`, { method: "DELETE" });
    await refreshFrames();
  } catch (e: any) {
    frameError.value = e?.data?.message || "Не удалилось";
  }
};

// --- Выдача рамок ---
const userQuery = ref("");
const foundUsers = ref<
  { id: number; name: string; email: string | null; avatarUrl: string | null }[]
>([]);
const grantTarget = ref<{
  id: number;
  name: string;
  avatarUrl: string | null;
} | null>(null);
const grantFrameId = ref<number | "random">("random");
const granting = ref(false);
const grantMsg = ref("");

// Ищем не на каждую букву: поиск идёт в базу, а имя дописывают быстрее, чем
// приходит ответ.
let userSearchTimer: ReturnType<typeof setTimeout> | undefined;
watch(userQuery, (q) => {
  clearTimeout(userSearchTimer);
  if (q.trim().length < 2) {
    foundUsers.value = [];
    return;
  }

  userSearchTimer = setTimeout(async () => {
    foundUsers.value = await $fetch("/api/admin/users", {
      query: { q: q.trim() },
    }).catch(() => []);
  }, 300);
});

const pickUser = (u: {
  id: number;
  name: string;
  avatarUrl: string | null;
}) => {
  grantTarget.value = u;
  userQuery.value = "";
  foundUsers.value = [];
};

const sendGrant = async (
  userId: number,
  frameId: number | "random",
  revoke = false,
) => {
  granting.value = true;
  grantMsg.value = "";

  try {
    const res = await $fetch<{ message: string }>("/api/admin/frames/grant", {
      method: "POST",
      body: { userId, frameId, revoke },
    });
    grantMsg.value = res.message;
    await refreshFrames();
  } catch (e: any) {
    grantMsg.value = e?.data?.message || "Не вышло";
  } finally {
    granting.value = false;
  }
};
</script>

<template>
  <section class="card card--panel card--wide">
    <h2>Рамки для аватарок</h2>

    <p class="frames-note">
      Рамка — картинка с прозрачной серединой. Достаётся за ивенты: выдать её
      можно здесь, а носить человек будет ту из выигранных, которую выберет сам
      в профиле.
    </p>

    <!-- Новая рамка -->
    <div class="frame-new">
      <UserAvatar
        class="frame-preview"
        :src="currentAvatar"
        :name="displayName"
        :frame="
          newFramePreview
            ? { id: 0, name: '', url: newFramePreview, fit: newFrame.fit }
            : null
        "
        :size="72"
        alt=""
      />

      <div class="frame-new-fields">
        <div class="field-row">
          <label>Название</label>
          <input
            v-model="newFrame.name"
            type="text"
            maxlength="40"
            placeholder="Костяной венок"
          />
        </div>

        <div class="field-row">
          <label>Картинка (png или webp с прозрачностью)</label>
          <input
            ref="frameFileInput"
            type="file"
            accept="image/*"
            @change="onFrameFile"
          />
        </div>

        <div class="field-row">
          <label
            >Посадка аватарки — {{ Math.round(newFrame.fit * 100) }}%</label
          >
          <input
            v-model.number="newFrame.fit"
            type="range"
            :min="FRAME_FIT_MIN"
            :max="FRAME_FIT_MAX"
            step="0.01"
          />
        </div>

        <button
          class="btn btn--primary"
          :disabled="savingFrame"
          @click="createFrame"
        >
          {{ savingFrame ? "Сохраняем..." : "Добавить рамку" }}
        </button>
        <p v-if="frameMsg" class="result-msg">{{ frameMsg }}</p>
        <p v-if="frameError" class="err-msg">{{ frameError }}</p>
      </div>
    </div>

    <hr class="section-divider" />

    <!-- Каталог -->
    <h3 class="frames-sub">Каталог ({{ frames.length }})</h3>
    <p v-if="!frames.length" class="empty-hint">Рамок пока нет</p>

    <div v-for="f in frames" :key="f.id" class="frame-row">
      <UserAvatar
        class="frame-preview"
        :src="currentAvatar"
        :name="displayName"
        :frame="f"
        :size="56"
        alt=""
      />

      <div class="frame-row-main">
        <input
          class="frame-row-name"
          :value="f.name"
          type="text"
          maxlength="40"
          @change="
            saveFrame(f, {
              name: ($event.target as HTMLInputElement).value,
            })
          "
        />

        <div class="frame-row-line">
          <label class="frame-fit">
            посадка {{ Math.round(f.fit * 100) }}%
            <input
              v-model.number="f.fit"
              type="range"
              :min="FRAME_FIT_MIN"
              :max="FRAME_FIT_MAX"
              step="0.01"
              @change="saveFrame(f, { fit: f.fit })"
            />
          </label>

          <label class="frame-pool">
            <input
              type="checkbox"
              :checked="f.inPool"
              @change="
                saveFrame(f, {
                  inPool: ($event.target as HTMLInputElement).checked,
                })
              "
            />
            <span>в раздаче</span>
          </label>

          <label
            class="frame-pool"
            title="Достаётся при регистрации и сразу надевается. Такая рамка одна на сайт."
          >
            <input
              type="checkbox"
              :checked="f.isDefault"
              @change="
                saveFrame(f, {
                  isDefault: ($event.target as HTMLInputElement).checked,
                })
              "
            />
            <span>новичкам</span>
          </label>

          <span class="frame-owners">у {{ f.owners }} чел.</span>
          <button class="frame-del" @click="removeFrame(f)">Удалить</button>
        </div>
      </div>
    </div>

    <div class="newcomer">
      <template v-if="defaultFrame">
        <UserAvatar
          class="frame-preview"
          :src="currentAvatar"
          :name="displayName"
          :frame="defaultFrame"
          :size="34"
          alt=""
        />
        <span class="newcomer-text">
          Новички получают «{{ defaultFrame.name }}» при регистрации и сразу в
          ней ходят.
        </span>
        <button
          class="btn btn--sm btn--primary"
          :disabled="backfilling"
          @click="backfillDefault"
        >
          {{ backfilling ? "..." : "Выдать и тем, кто уже есть" }}
        </button>
      </template>
      <span v-else class="newcomer-text">
        Рамка новичка не выбрана — новые читатели приходят без рамки. Отметь
        «новичкам» у той, что должна доставаться всем.
      </span>
    </div>

    <hr class="section-divider" />

    <!-- Выдача -->
    <h3 class="frames-sub">Выдать рамку</h3>

    <div class="field-row">
      <label>Кому</label>
      <input
        v-model="userQuery"
        type="text"
        placeholder="имя или почта — от двух букв"
      />
    </div>

    <div v-if="foundUsers.length" class="user-found">
      <button
        v-for="u in foundUsers"
        :key="u.id"
        class="user-hit"
        @click="pickUser(u)"
      >
        <UserAvatar
          :src="u.avatarUrl"
          :name="u.name"
          :frame="null"
          :size="26"
          alt=""
        />
        <span class="user-hit-name">{{ u.name }}</span>
        <span class="user-hit-mail">{{ u.email }}</span>
      </button>
    </div>

    <div v-if="grantTarget" class="grant-row">
      <UserAvatar
        :src="grantTarget.avatarUrl"
        :name="grantTarget.name"
        :frame="null"
        :size="32"
        alt=""
      />
      <span class="grant-name">{{ grantTarget.name }}</span>

      <select v-model="grantFrameId" class="grant-select">
        <option value="random">Случайная из раздачи</option>
        <option v-for="f in frames" :key="f.id" :value="f.id">
          {{ f.name }}
        </option>
      </select>

      <button
        class="btn btn--primary"
        :disabled="granting"
        @click="sendGrant(grantTarget.id, grantFrameId)"
      >
        {{ granting ? "..." : "Выдать" }}
      </button>
    </div>

    <p v-if="grantMsg" class="result-msg">{{ grantMsg }}</p>

    <!-- Кто чем владеет -->
    <h3 class="frames-sub">Владельцы ({{ frameOwners.length }})</h3>
    <p v-if="!frameOwners.length" class="empty-hint">
      Пока никому ничего не выдано
    </p>

    <div v-for="o in frameOwners" :key="o.id" class="owner-row">
      <UserAvatar
        :src="o.avatarUrl"
        :name="o.name"
        :frame="null"
        :size="28"
        alt=""
      />
      <span class="owner-name">{{ o.name }}</span>

      <span class="owner-frames">
        <button
          v-for="uf in o.frames"
          :key="uf.id"
          class="owner-frame"
          :class="{ worn: o.wearing === uf.id }"
          :title="
            o.wearing === uf.id
              ? 'Носит сейчас — нажми, чтобы забрать'
              : 'Забрать рамку'
          "
          @click="sendGrant(o.id, uf.id, true)"
        >
          {{ frameName(uf.id) }} ×
        </button>
      </span>
    </div>
  </section>
</template>

<style scoped src="../assets/css/admin-panel.css"></style>

<style scoped>
/* Раскрытый список Windows рисует сам, на белом, а цвет текста берёт у поля —
   светлый пергамент на белом не читается. Пунктам задаём тёмный фон явно. */
.field-row select option,
.grant-select option {
  background: var(--bg-dark);
  color: var(--parchment);
}

.err-msg {
  font-size: 13px;
  color: var(--danger);
  margin-top: 10px;
}

/* ── Рамки для аватарок ──────────────────────── */
.frames-note {
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.55;
  margin: -12px 0 22px;
  max-width: 60ch;
}

.frames-sub {
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 14px;
}

/* Предпросмотр — на своей же аватарке: посадку рамки нельзя выбрать в
   отвлечённом виде, её подгоняют, глядя на живое лицо в кружке. */
.frame-preview {
  background: var(--fill-strong);
  color: var(--parchment);
}

.frame-new {
  display: flex;
  align-items: flex-start;
  gap: 26px;
}

.frame-new-fields {
  flex: 1;
  min-width: 0;
}

.frame-row {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 14px 0;
  border-top: 1px solid var(--line-faint);
}

.frame-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.frame-row-name {
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 14px;
  padding: 4px 7px;
  margin-left: -7px;
  width: 100%;
  max-width: 280px;
}

.frame-row-name:hover {
  border-color: rgba(241, 230, 210, 0.15);
}

.frame-row-name:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

.frame-row-line {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 12px;
  opacity: 0.6;
}

.frame-fit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.frame-fit input {
  width: 110px;
}

.frame-pool {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.frame-owners {
  margin-left: auto;
}

.frame-del {
  background: none;
  border: none;
  padding: 0;
  color: var(--danger);
  font-family: var(--font-body);
  font-size: 12px;
  cursor: pointer;
}

.frame-del:hover {
  text-decoration: underline;
}

/* Рамка новичка — не такая же строка каталога, а правило, которое к нему
   применяется: оттого своя полоса, а не ещё одна карточка. */
.newcomer {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--fill-faint);
}

.newcomer-text {
  flex: 1;
  min-width: 220px;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.65;
}

/* ── Выдача ─────────────────────────────────── */
.user-found {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin: -6px 0 16px;
}

.user-hit {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.user-hit:hover {
  background: rgba(241, 230, 210, 0.06);
}

.user-hit-mail {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.4;
}

.grant-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.grant-name {
  font-size: 14px;
}

.grant-select {
  background: var(--fill);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 13px;
  padding: 8px 10px;
}

.owner-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid var(--line-faint);
}

.owner-name {
  font-size: 13px;
}

.owner-frames {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* Носимая рамка отмечена — забрать её можно, но видно, что человек в ней
   сейчас ходит. */
.owner-frame {
  background: var(--fill);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 11px;
  padding: 4px 8px;
  cursor: pointer;
  opacity: 0.7;
}

.owner-frame.worn {
  border-color: var(--ember-soft);
  opacity: 1;
}

.owner-frame:hover {
  color: var(--danger);
}

@media (max-width: 600px) {
  .frame-new {
    flex-direction: column;
    align-items: center;
  }
}
</style>
