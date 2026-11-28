/**
 * Картинки окна ёлки — загрузить и раскодировать один раз, заранее.
 *
 * Главная зовёт это, когда сама загрузилась и браузер свободен: к нажатию
 * «Потрясти ёлку» растрёпанная ёлка, все коробки (какая выпадет, решает
 * сервер) и кот уже на месте, и окно ничего не качает. Дальше их отдаёт кеш
 * браузера — '/tree/**' кешируется на сутки, после — только сверка без
 * скачивания (см. routeRules в nuxt.config.ts).
 *
 * Ссылки на картинки держим, чтобы раскодированное не выбросили раньше
 * времени. Повторный вызов отдаёт тот же ответ.
 */
const TREE_IMAGES = [
  "/tree/tree-shake.webp",
  ...["red", "green", "blue", "gold"].flatMap((tone) => [
    `/tree/gift-${tone}-closed.webp`,
    `/tree/gift-${tone}-open.webp`,
  ]),
  "/tree/cat-peek.webp",
  "/tree/cat-fall.webp",
  "/tree/cat-run.webp",
];

let held: HTMLImageElement[] = [];
let ready: Promise<unknown> | null = null;

export function preloadTreeImages(): Promise<unknown> {
  if (ready) return ready;
  held = TREE_IMAGES.map((src) => Object.assign(new Image(), { src }));
  ready = Promise.all(held.map((img) => img.decode().catch(() => {})));
  return ready;
}

/** То же, но когда браузеру нечем заняться: главную это не притормозит. */
export function preloadTreeImagesIdle() {
  if (ready) return;
  const run = () => void preloadTreeImages();
  if ("requestIdleCallback" in window)
    requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
