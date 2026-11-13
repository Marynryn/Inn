/**
 * Сезонное оформление сайта: осенью — листья в углах плашек и на фоне главы,
 * зимой — снег, сосульки и снежинки. Переключается в админке настройкой
 * `season`; новогодние украшения (гирлянда, ёлка) сюда добавятся отдельным
 * значением, когда до них дойдёт.
 */
export type Season = "autumn" | "winter";

export const SEASONS: { value: Season; label: string }[] = [
  { value: "autumn", label: "Осень — листья" },
  { value: "winter", label: "Зима — снег и сосульки" },
];

/** Пустая или незнакомая настройка — осень: так сайт выглядел до переключателя. */
export function seasonOf(settings?: { season?: string } | null): Season {
  return settings?.season === "winter" ? "winter" : "autumn";
}

/**
 * Фон страницы главы зимой (настройка `winter_reader_bg`). Как фон на
 * Хеллоуин: образцы — обычный тёплый, холодный синий той же яркости, середина
 * и посветлее; можно выбрать и свой цвет. Пусто — обычный фон.
 */
export const WINTER_READER_BG_PRESETS = [
  { hex: "#2b221c", label: "обычный" },
  { hex: "#1c222d", label: "та же яркость" },
  { hex: "#1f2735", label: "посередине" },
  { hex: "#232d40", label: "светлее" },
] as const;

/** Цвет вида #rrggbb в нижнем регистре или null. Настройка уходит прямо в стиль
 *  страницы — всё, что не цвет, не должно туда попасть. */
export const safeHex = (v: unknown): string | null =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim())
    ? v.trim().toLowerCase()
    : null;

/** Зимний фон главы, если включена зима и цвет задан; иначе null — обычный фон. */
export function winterReaderBg(
  settings?: { season?: string; winter_reader_bg?: string } | null,
): string | null {
  return seasonOf(settings) === "winter"
    ? safeHex(settings?.winter_reader_bg)
    : null;
}
