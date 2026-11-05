import type { Ref } from "vue";

/**
 * Админу — список глав вместе с черновиками: он читает впереди. Общий
 * /api/chapters одинаков для всех и черновиков не отдаёт, иначе первый же
 * заход админа положил бы их в общий кеш. Поэтому полный список админ
 * дозапрашивает уже в браузере, из /api/admin/chapters, и подменяет им общий.
 */
export function useAdminDrafts<T>(
  data: Ref<T[] | null | undefined>,
  map: (list: any[]) => T[],
) {
  const auth = useAuthStore();
  onMounted(() => {
    // Пользователь в сторе может появиться и после монтирования: плагин не
    // ждёт ответа /api/auth/me.
    watch(
      () => auth.isAdmin,
      async (isAdmin) => {
        if (!isAdmin) return;
        try {
          data.value = map(await $fetch<any[]>("/api/admin/chapters"));
        } catch {
          // не вышло — админ видит то же, что читатель
        }
      },
      { immediate: true },
    );
  });
}
