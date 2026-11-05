<script setup lang="ts">
/** Вкладка «Аккаунт»: свой профиль, новые админы, резервные копии. */
// --- Профиль ---
const { data: profile, refresh: refreshProfile } =
  useFetch("/api/admin/profile");
const displayName = ref("");
const profileEmail = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const avatarFile = ref<File | null>(null);
const avatarPreview = ref<string | null>(null);
const savingProfile = ref(false);
const profileSaved = ref(false);
const profileError = ref("");

watch(
  profile,
  (p) => {
    if (p) {
      displayName.value = p.displayName || "";
      profileEmail.value = p.email || "";
    }
  },
  { immediate: true },
);

const onAvatarFile = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  avatarFile.value = file;
  if (file) avatarPreview.value = URL.createObjectURL(file);
};

const saveProfile = async () => {
  profileError.value = "";
  if (newPassword.value && newPassword.value !== confirmPassword.value) {
    profileError.value = "Пароли не совпадают";
    return;
  }
  savingProfile.value = true;
  try {
    const fd = new FormData();
    fd.append("displayName", displayName.value);
    if (profileEmail.value) fd.append("email", profileEmail.value);
    if (newPassword.value) fd.append("newPassword", newPassword.value);
    if (avatarFile.value)
      fd.append("avatar", await toSmallSquare(avatarFile.value), "avatar.webp");
    await $fetch("/api/admin/profile", { method: "PUT", body: fd });
    newPassword.value = "";
    confirmPassword.value = "";
    profileSaved.value = true;
    setTimeout(() => {
      profileSaved.value = false;
    }, 2000);
    await refreshProfile();
  } catch (e: any) {
    profileError.value = e?.data?.message || "Ошибка сохранения";
  } finally {
    savingProfile.value = false;
  }
};

const currentAvatar = computed(
  () => avatarPreview.value || profile.value?.avatarUrl || null,
);

// --- Пользователи ---
const newUserEmail = ref("");
const newUserPassword = ref("");
const creatingUser = ref(false);
const userCreated = ref(false);
const userError = ref("");

const createUser = async () => {
  userError.value = "";
  if (!newUserEmail.value || !newUserPassword.value) {
    userError.value = "Заполни все поля";
    return;
  }
  creatingUser.value = true;
  try {
    await $fetch("/api/admin/users", {
      method: "POST",
      body: {
        email: newUserEmail.value,
        password: newUserPassword.value,
        role: "admin",
      },
    });
    newUserEmail.value = "";
    newUserPassword.value = "";
    userCreated.value = true;
    setTimeout(() => {
      userCreated.value = false;
    }, 3000);
  } catch (e: any) {
    userError.value = e?.data?.message || "Ошибка создания";
  } finally {
    creatingUser.value = false;
  }
};
</script>

<template>
  <section class="card card--panel">
    <h2>Мой профиль</h2>
    <div class="profile-row">
      <div class="avatar-wrap">
        <img
          v-if="currentAvatar"
          :src="currentAvatar"
          class="avatar-img"
          alt=""
        />
        <div v-else class="avatar-placeholder display">
          {{ (displayName || profile?.email || "?").charAt(0).toUpperCase() }}
        </div>
        <label class="avatar-upload-btn" title="Загрузить фото">
          ✎
          <input
            type="file"
            accept="image/*"
            class="avatar-input"
            @change="onAvatarFile"
          />
        </label>
      </div>
      <div class="profile-fields">
        <div class="field-row">
          <label>Отображаемое имя</label>
          <input
            v-model="displayName"
            type="text"
            placeholder="Как тебя звать в комментах"
          />
        </div>
        <div class="field-row">
          <label>Email</label>
          <input
            v-model="profileEmail"
            type="email"
            placeholder="Email для входа"
          />
        </div>
        <div class="field-row">
          <label>Новый пароль</label>
          <input
            v-model="newPassword"
            type="password"
            placeholder="Оставь пустым, чтобы не менять"
          />
        </div>
        <div class="field-row" v-if="newPassword">
          <label>Повтори пароль</label>
          <input
            v-model="confirmPassword"
            type="password"
            placeholder="Повтори новый пароль"
          />
        </div>
      </div>
    </div>
    <div v-if="profileError" class="form-error">{{ profileError }}</div>
    <button
      class="btn btn--primary"
      :disabled="savingProfile"
      @click="saveProfile"
    >
      {{
        profileSaved
          ? "✓ Сохранено"
          : savingProfile
            ? "Сохраняем..."
            : "Сохранить профиль"
      }}
    </button>

    <hr class="section-divider" />
    <h2>Добавить пользователя</h2>
    <div class="profile-fields" style="max-width: 360px">
      <div class="field-row">
        <label>Email</label>
        <input
          v-model="newUserEmail"
          type="email"
          placeholder="Email нового пользователя"
        />
      </div>
      <div class="field-row">
        <label>Пароль</label>
        <input
          v-model="newUserPassword"
          type="password"
          placeholder="Пароль (минимум 12 символов)"
        />
      </div>
    </div>
    <div v-if="userError" class="form-error">{{ userError }}</div>
    <button
      class="btn btn--primary"
      :disabled="creatingUser"
      @click="createUser"
      style="margin-top: 12px"
    >
      {{
        userCreated
          ? "✓ Пользователь создан"
          : creatingUser
            ? "Создаём..."
            : "Создать администратора"
      }}
    </button>

    <hr class="section-divider" />
    <AdminBackups />
  </section>
</template>

<style scoped src="../assets/css/admin-panel.css"></style>

<style scoped>
/* Профиль */
.profile-row {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  margin-bottom: 20px;
}

.avatar-wrap {
  position: relative;
  flex: 0 0 auto;
}

.avatar-img {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-round);
  object-fit: cover;
  border: 2px solid var(--line-strong);
}

.avatar-placeholder {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-round);
  background: linear-gradient(135deg, var(--ember-soft), var(--moss));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 600;
  color: var(--bg-dark);
}

.avatar-upload-btn {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-round);
  background: var(--ember);
  color: var(--bg-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
  border: 2px solid var(--bg-dark-2);
}

.avatar-input {
  display: none;
}

.profile-fields {
  flex: 1;
  min-width: 0;
}
</style>
