/**
 * Пока открыто окно поверх страницы, анимации самой страницы под ним стоят:
 * феи, искры, пульс кнопок под тёмной подложкой всё равно почти не видны, а
 * телефон тратил на них больше, чем на само окно. Окно должно быть вынесено
 * из корня приложения (Teleport в body) — иначе встанет и оно само.
 *
 * Окон может быть открыто несколько — страница оживает, когда закрылось
 * последнее.
 */
let open = 0;

export function usePausePage() {
  onMounted(() => {
    if (open++ === 0) document.documentElement.classList.add("page-paused");
  });
  onUnmounted(() => {
    if (--open === 0) document.documentElement.classList.remove("page-paused");
  });
}
