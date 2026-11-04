import type { User } from "#auth-utils";

/** Тот же пользователь, что в сессии (shared/types/auth.d.ts), но номер есть
 *  только у хозяйки сайта: читателю свой номер не отдаётся, см. /api/auth/me. */
export type SessionUser = Omit<User, "id"> & { id?: number };

export const useAuthStore = defineStore("auth", () => {
  const user = ref<SessionUser | null>(null);
  const isAdmin = computed(() => user.value?.role === "admin");
  const isAuthed = computed(() => Boolean(user.value));
  /** Ответ /api/auth/me уже пришёл: до него «не вошёл» значит «ещё не знаем». */
  const ready = ref(false);

  /** Имя для показа: ник, часть почты до собаки или безликое «Читатель». */
  const name = computed(() =>
    user.value
      ? user.value.displayName || user.value.email?.split("@")[0] || "Читатель"
      : "",
  );

  async function fetchMe() {
    try {
      // Адрес строкой: вывод типа по таблице маршрутов здесь упирается в предел
      // глубины TypeScript.
      user.value = await $fetch<SessionUser | null>("/api/auth/me" as string);
    } catch {
      user.value = null;
    }
    ready.value = true;
  }

  async function login(email: string, password: string) {
    await $fetch("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    await fetchMe();
  }

  async function logout() {
    await $fetch("/api/auth/logout", { method: "POST" });
    user.value = null;
    // Закладка вышедшего не должна достаться следующему за этим экраном.
    useReadProgress().clearLocal();
  }

  return { user, isAdmin, isAuthed, ready, name, fetchMe, login, logout };
});
