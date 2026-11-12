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
