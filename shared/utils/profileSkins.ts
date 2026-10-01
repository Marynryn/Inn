/**
 * Скин публичной страницы читателя: картинка по углам карточки, цвета и
 * эффекты, которые рисует код. Устроен как рамка: каталог, выданное, надетое.
 */

/** Эффекты, которые умеет код. Скин лишь отмечает, какие из них нужны. */
export const SKIN_EFFECTS = {
  spider: 'Паучок на нити',
  dust: 'Пылинки',
} as const

export type SkinEffect = keyof typeof SKIN_EFFECTS

export type ProfileSkin = {
  id: number
  name: string
  /** Картинка для углов: левый верхний угол, остальные — её отражения. */
  url: string
  /** Цвет цифр и мелочей на странице. */
  accent: string
  /** Фон карточки. */
  tint: string
  effects: SkinEffect[]
}

/** Скин в списке выбора. Не выдан — это примерка хозяйки сайта. */
export type OwnedSkin = ProfileSkin & { grantedAt: string | null; owned: boolean }

export const SKIN_NAME_MAX = 40

/** Картинка угла — крупная и с тонкими нитями, вес как у рамки. */
export const MAX_SKIN_BYTES = 600 * 1024
export const MAX_SKIN_SIDE = 1024

export const isHexColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

/** Эффекты из строки базы: незнакомые выкидываем, порядок — как в SKIN_EFFECTS. */
export const parseEffects = (raw: string | null | undefined): SkinEffect[] => {
  const set = new Set(String(raw ?? '').split(',').map(s => s.trim()))
  return (Object.keys(SKIN_EFFECTS) as SkinEffect[]).filter(e => set.has(e))
}
