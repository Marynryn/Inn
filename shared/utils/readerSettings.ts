/**
 * Настройки вида страницы главы: тема, кегль, высота строки, ширина колонки.
 * Один список допустимого и для окна настроек, и для сервера: что бы ни
 * прислали, в базу и на страницу попадает только значение из этих рамок.
 */

export const READER_THEMES = ['default', 'dark', 'sepia', 'light'] as const
export type ReaderTheme = typeof READER_THEMES[number]

export const READER_THEME_NAMES: Record<ReaderTheme, string> = {
  default: 'Стандартная',
  dark: 'Тёмная',
  sepia: 'Сепия',
  light: 'Белая',
}

/** Кегль в пунктах: от 10 до 24 через два. */
export const READER_FONT_SIZES = [10, 12, 14, 16, 18, 20, 22, 24] as const

export const READER_LINE_HEIGHT = { min: 1.2, max: 2, step: 0.05 } as const

/** Ширина колонки — доля ширины окна в процентах. */
export const READER_WIDTH = { min: 50, max: 100, step: 1 } as const

export type ReaderSettings = {
  theme: ReaderTheme
  fontSize: number
  lineHeight: number
  width: number
}

// 12pt — это 16px, ближайший к прежним 17px шаг сетки; 1.85 — прежняя высота
// строки; 50 % окна — прежние 960px на экране 1920.
export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'default',
  fontSize: 12,
  lineHeight: 1.85,
  width: 50,
}

const clamp = (raw: unknown, min: number, max: number, step: number, fallback: number) => {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  const snapped = Math.round((n - min) / step) * step + min
  // Округляем до двух знаков: шаг 0.05 в плавающей точке даёт хвосты вроде 1.4500000001.
  return Math.round(Math.min(Math.max(snapped, min), max) * 100) / 100
}

/** Приводит что угодно к настройкам в допустимых рамках; мусор заменяется умолчанием. */
export function normalizeReaderSettings(raw: unknown): ReaderSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const theme = READER_THEMES.includes(r.theme as ReaderTheme) ? r.theme as ReaderTheme : DEFAULT_READER_SETTINGS.theme
  const fontSize = READER_FONT_SIZES.includes(Number(r.fontSize) as typeof READER_FONT_SIZES[number])
    ? Number(r.fontSize)
    : DEFAULT_READER_SETTINGS.fontSize
  return {
    theme,
    fontSize,
    lineHeight: clamp(r.lineHeight, READER_LINE_HEIGHT.min, READER_LINE_HEIGHT.max, READER_LINE_HEIGHT.step, DEFAULT_READER_SETTINGS.lineHeight),
    width: clamp(r.width, READER_WIDTH.min, READER_WIDTH.max, READER_WIDTH.step, DEFAULT_READER_SETTINGS.width),
  }
}

export const isDefaultReaderSettings = (s: ReaderSettings) =>
  (Object.keys(DEFAULT_READER_SETTINGS) as (keyof ReaderSettings)[]).every(k => s[k] === DEFAULT_READER_SETTINGS[k])
